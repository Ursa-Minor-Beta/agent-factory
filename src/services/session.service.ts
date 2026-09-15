import crypto from 'crypto';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import type { ISessionRepository } from '../domain/interfaces/repositories/ISessionRepository.js';
import type { IMessageRepository } from '../domain/interfaces/repositories/IMessageRepository.js';
import type { IAgentRepository } from '../domain/interfaces/repositories/IAgentRepository.js';
import type { IProviderConfigRepository } from '../domain/interfaces/repositories/IProviderConfigRepository.js';
import type { IRunRepository } from '../domain/interfaces/repositories/IRunRepository.js';
import type { IUserSecretRepository } from '../domain/interfaces/repositories/IUserSecretRepository.js';
import type { IFileRepository } from '../domain/interfaces/repositories/IFileRepository.js';
import type { Session, SessionStatus } from '../domain/entities/Session.js';
import { AGENT_NOTES_MAX_LENGTH } from '../domain/entities/Session.js';
import type { Message } from '../domain/entities/Message.js';
import { resolveRunOutput } from '../utils/node-ref.js';
import type { ProviderConfig } from '../engine/nodes/base.js';
import { WorkflowExecutor } from '../engine/executor.js';
import { ProviderConfigService } from './provider-config.service.js';
import { UserSecretService } from './user-secret.service.js';
import { NotFoundError, ForbiddenError, AgentExecutionError } from '../utils/errors.js';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ExtractedFile {
  mimeType: string;
  data: string;
  field?: string;
}

export interface ChatOptions {
  sessionId?: string;
  incognito?: boolean;
}

export interface ChatResult {
  sessionId: string | null;
  response: string;
  files: ExtractedFile[];
  runId: string;
  isNewSession: boolean;
}

interface IncognitoSession {
  userId: string;
  agentId: string;
  messages: ChatMessage[];
  agentNotes: string;
  createdAt: number;
  lastAccessedAt: number;
}

// In-memory store for incognito sessions
const incognitoSessions = new Map<string, IncognitoSession>();

// TTL for incognito sessions (1 hour)
const INCOGNITO_SESSION_TTL_MS = 60 * 60 * 1000;

// Cleanup interval (every 5 minutes)
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

// Start cleanup timer
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of incognitoSessions.entries()) {
    if (now - session.lastAccessedAt > INCOGNITO_SESSION_TTL_MS) {
      incognitoSessions.delete(sessionId);
    }
  }
}, CLEANUP_INTERVAL_MS);

export class SessionService {
  private executor: WorkflowExecutor;
  private providerConfigService: ProviderConfigService;
  private userSecretService: UserSecretService;

  constructor(
    private sessionRepo: ISessionRepository,
    private messageRepo: IMessageRepository,
    private agentRepo: IAgentRepository,
    private runRepo: IRunRepository,
    private fileRepo: IFileRepository,
    providerConfigRepo: IProviderConfigRepository,
    userSecretRepo: IUserSecretRepository
  ) {
    this.executor = new WorkflowExecutor(runRepo, fileRepo);
    this.providerConfigService = new ProviderConfigService(providerConfigRepo);
    this.userSecretService = new UserSecretService(userSecretRepo);
  }

  /**
   * Chat with an agent - auto-creates session if not provided
   */
  async chat(
    userId: string,
    agentId: string,
    input: Record<string, unknown>,
    options: ChatOptions = {}
  ): Promise<ChatResult> {
    const agent = await this.agentRepo.findById(agentId);
    if (!agent) {
      throw new NotFoundError('Agent');
    }
    if (agent.userId !== userId && !agent.isSystem) {
      throw new ForbiddenError('Access denied');
    }

    const { sessionId, incognito = false } = options;
    let session: Session | null = null;
    let incognitoSession: IncognitoSession | null = null;
    let isNewSession = false;
    let messagesHistory: ChatMessage[] = []; // Only used for incognito sessions
    let agentNotes = '';
    let effectiveSessionId: string | null = null;

    // Check if this is an incognito session ID
    const isIncognitoSessionId = sessionId?.startsWith('incognito_');

    // Serialize input for session history
    const inputContent = JSON.stringify(input);

    // Build provider config
    const providers = await this.providerConfigService.buildExecutionConfig(userId);

    // Resume existing incognito session
    if (isIncognitoSessionId && sessionId) {
      incognitoSession = incognitoSessions.get(sessionId) ?? null;
      if (!incognitoSession) {
        throw new NotFoundError('Incognito session expired or not found');
      }
      if (incognitoSession.userId !== userId) {
        throw new ForbiddenError('Access denied');
      }
      if (incognitoSession.agentId !== agentId) {
        throw new ForbiddenError('Session belongs to a different agent');
      }
      // Update last accessed time
      incognitoSession.lastAccessedAt = Date.now();
      messagesHistory = [...incognitoSession.messages];
      agentNotes = incognitoSession.agentNotes;
      effectiveSessionId = sessionId;
    } 
    // Resume existing persisted session
    else if (sessionId) {
      session = await this.sessionRepo.findById(sessionId);
      if (!session) {
        throw new NotFoundError('Session');
      }
      if (session.userId !== userId) {
        throw new ForbiddenError('Access denied');
      }
      if (session.agentId !== agentId) {
        throw new ForbiddenError('Session belongs to a different agent');
      }
      // Note: messages are fetched by LLM node on-demand with maxMessages limit
      agentNotes = session.agentNotes;
      effectiveSessionId = sessionId;
    } 
    // Create new incognito session (in-memory)
    else if (incognito) {
      const newSessionId = `incognito_${crypto.randomUUID()}`;
      incognitoSession = {
        userId,
        agentId,
        messages: [],
        agentNotes: '',
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
      };
      incognitoSessions.set(newSessionId, incognitoSession);
      effectiveSessionId = newSessionId;
      isNewSession = true;
    } 
    // Create new persisted session
    else {
      const title = await this.generateTitle(inputContent, providers).catch(() => {}) || '';
      session = await this.sessionRepo.create({
        userId,
        agentId,
        title,
        incognito: false,
      });
      effectiveSessionId = session.id;
      isNewSession = true;
    }

    // Add user message to incognito session memory
    if (incognitoSession) {
      incognitoSession.messages.push({ role: 'user', content: inputContent });
    }

    // Save user message to DB if persisted session
    if (session) {
      await this.messageRepo.create({
        sessionId: session.id,
        role: 'user',
        content: inputContent,
      });
    }

    // Pre-resolve all user secrets for {{secret:KEY}} interpolation
    const resolvedSecrets = await this.userSecretService.buildSecretsMap(userId);

    // Create saveNotes callback for built-in save_note tool
    const saveNotes = effectiveSessionId
      ? async (notes: string) => {
          await this.setAgentNotes(userId, effectiveSessionId!, notes);
        }
      : undefined;

    // Execute agent with input (context passed via options, not mixed into input)
    const run = await this.executor.execute(
      agent,
      input,
      userId,
      {
        providers,
        agentRepo: this.agentRepo,
        runRepo: this.runRepo,
        messageRepo: this.messageRepo,
        userId,
        callStack: new Set([agent.id]),
        sessionId: effectiveSessionId ?? undefined,
        saveNotes,
        resolvedSecrets,
        // Session context (separate from user input)
        messages: messagesHistory,
        agentNotes,
      }
    );

    // Check if run failed and return error with runId for debugging
    if (run.status === 'failed') {
      throw new AgentExecutionError(run.error ?? 'Agent execution failed', run.id);
    }

    // Resolve nodeRef references to actual values, then extract text response
    const resolvedOutput = resolveRunOutput(run);
    const responseText = this.extractTextResponse(resolvedOutput);

    // Files are already saved by executor - use refs from run
    const fileRefs = run.files ?? [];

    // Add assistant message to incognito session memory (text only, no large files)
    if (incognitoSession) {
      incognitoSession.messages.push({ role: 'assistant', content: responseText });
    }

    // Save assistant message to DB if persisted session
    if (session) {
      await this.messageRepo.create({
        sessionId: session.id,
        runId: run.id,
        role: 'assistant',
        content: responseText,
        files: fileRefs.length > 0 ? fileRefs : undefined,
      });
    }

    // Convert file refs to ExtractedFile format for API response
    const files: ExtractedFile[] = fileRefs.map((ref) => {
      const parts = ref.split(':');
      return {
        mimeType: 'application/octet-stream', // Will be resolved when fetching
        data: '', // Data is in DB, not returned here
        field: parts[2] ?? 'file',
      };
    });

    return {
      sessionId: effectiveSessionId,
      response: responseText,
      files,
      runId: run.id,
      isNewSession,
    };
  }

  async getById(userId: string, sessionId: string): Promise<Session> {
    const session = await this.sessionRepo.findById(sessionId);
    if (!session) {
      throw new NotFoundError('Session');
    }
    if (session.userId !== userId) {
      throw new ForbiddenError('Access denied');
    }
    return session;
  }

  async update(
    userId: string,
    sessionId: string,
    data: { title?: string; status?: SessionStatus }
  ): Promise<Session> {
    const session = await this.getById(userId, sessionId);

    // Validate and map allowed fields
    const updates: { title?: string; status?: SessionStatus } = {};

    if (data.title !== undefined) {
      if (data.title !== null && typeof data.title !== 'string') {
        throw new Error('Title must be a string or null');
      }
      updates.title = data.title;
    }

    if (data.status !== undefined) {
      if (data.status !== 'active' && data.status !== 'archived') {
        throw new Error('Status must be "active" or "archived"');
      }
      updates.status = data.status;
    }

    if (Object.keys(updates).length === 0) {
      return session;
    }

    const updated = await this.sessionRepo.update(session.id, updates);
    if (!updated) {
      throw new Error('Failed to update session');
    }
    return updated;
  }

  async list(
    userId: string,
    options?: { agentId?: string; status?: SessionStatus; limit?: number; offset?: number }
  ): Promise<Session[]> {
    return this.sessionRepo.findByUserId(userId, options);
  }

  async delete(userId: string, sessionId: string): Promise<void> {
    // Check if incognito session
    if (sessionId.startsWith('incognito_')) {
      const incognitoSession = incognitoSessions.get(sessionId);
      if (!incognitoSession) {
        throw new NotFoundError('Session');
      }
      if (incognitoSession.userId !== userId) {
        throw new ForbiddenError('Access denied');
      }
      incognitoSessions.delete(sessionId);
      return;
    }

    // Persisted session
    const session = await this.getById(userId, sessionId);
    await this.messageRepo.deleteBySessionId(session.id);
    await this.sessionRepo.delete(session.id);
  }

  async getMessages(
    userId: string,
    sessionId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<Message[]> {
    // Check if incognito session
    if (sessionId.startsWith('incognito_')) {
      const incognitoSession = incognitoSessions.get(sessionId);
      if (!incognitoSession) {
        throw new NotFoundError('Session');
      }
      if (incognitoSession.userId !== userId) {
        throw new ForbiddenError('Access denied');
      }
      // Return messages from memory (with fake IDs and timestamps)
      const { limit = 50, offset = 0 } = options ?? {};
      return incognitoSession.messages.slice(offset, offset + limit).map((msg, idx) => ({
        id: `incognito_msg_${idx}`,
        sessionId,
        role: msg.role,
        content: msg.content,
        createdAt: new Date(incognitoSession.createdAt + idx * 1000),
      }));
    }

    // Persisted session
    await this.getById(userId, sessionId);
    return this.messageRepo.findBySessionId(sessionId, { ...options, order: 'asc' });
  }

  async setAgentNotes(userId: string, sessionId: string, notes: string): Promise<void> {
    // Validate length
    if (notes.length > AGENT_NOTES_MAX_LENGTH) {
      throw new Error(`Agent notes exceed maximum length of ${AGENT_NOTES_MAX_LENGTH} characters`);
    }

    // Check if incognito session
    if (sessionId.startsWith('incognito_')) {
      const incognitoSession = incognitoSessions.get(sessionId);
      if (!incognitoSession) {
        throw new NotFoundError('Session');
      }
      if (incognitoSession.userId !== userId) {
        throw new ForbiddenError('Access denied');
      }
      incognitoSession.agentNotes = notes;
      return;
    }

    // Persisted session
    const session = await this.getById(userId, sessionId);
    await this.sessionRepo.setAgentNotes(session.id, notes);
  }

  async getAgentNotes(userId: string, sessionId: string): Promise<string> {
    // Check if incognito session
    if (sessionId.startsWith('incognito_')) {
      const incognitoSession = incognitoSessions.get(sessionId);
      if (!incognitoSession) {
        throw new NotFoundError('Session');
      }
      if (incognitoSession.userId !== userId) {
        throw new ForbiddenError('Access denied');
      }
      return incognitoSession.agentNotes;
    }

    // Persisted session
    const session = await this.getById(userId, sessionId);
    return session.agentNotes;
  }

  /**
   * Extract text response from run output (files are already extracted by executor)
   */
  private extractTextResponse(output: Record<string, unknown> | null): string {
    if (!output) {
      return 'No response generated.';
    }

    // Get text response from common output fields
    if (typeof output.response === 'string') {
      return output.response;
    }
    if (typeof output.value === 'string') {
      return output.value;
    }
    if (output.value && typeof (output.value as Record<string, unknown>).response === 'string') {
      return (output.value as Record<string, unknown>).response as string;
    }

    return JSON.stringify(output);
  }

  /**
   * Generate a short title for a session based on the first message (silent fail)
   */
  private async generateTitle(
    userMessage: string,
    providers: ProviderConfig
  ): Promise<string | undefined> {
    try {
      const prompt = userMessage.slice(0, 1000);
      const systemPrompt = 'Generate a very short title (max 6 words) for this conversation. Return only the title, no quotes or punctuation.';
      let title: string | undefined;

      if (providers.openai?.apiKey) {
        title = await this.generateTitleWithOpenAI(prompt, systemPrompt, providers);
      } else if (providers.anthropic?.apiKey) {
        title = await this.generateTitleWithAnthropic(prompt, systemPrompt, providers);
      }

      return title;
    } catch (error) {
      // Log error but don't throw - title generation is not critical
      console.error('Failed to generate session title:', error instanceof Error ? error.message : error);
      return;
    }
  }

  private async generateTitleWithOpenAI(
    prompt: string,
    systemPrompt: string,
    providers: ProviderConfig
  ): Promise<string | undefined> {
    const client = new OpenAI({
      apiKey: providers.openai!.apiKey,
      baseURL: providers.openai!.baseUrl,
    });

    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      max_tokens: 30,
      temperature: 0.7,
    });

    return completion.choices[0]?.message?.content?.trim();
  }

  private async generateTitleWithAnthropic(
    prompt: string,
    systemPrompt: string,
    providers: ProviderConfig
  ): Promise<string | undefined> {
    const client = new Anthropic({
      apiKey: providers.anthropic!.apiKey,
      baseURL: providers.anthropic!.baseUrl,
    });

    const response = await client.messages.create({
      model: 'claude-3-5-haiku-latest',
      max_tokens: 30,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === 'text'
    );
    return textBlock?.text?.trim();
  }
}
