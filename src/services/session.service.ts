import type { ISessionRepository } from '../domain/interfaces/repositories/ISessionRepository.js';
import type { IMessageRepository } from '../domain/interfaces/repositories/IMessageRepository.js';
import type { IAgentRepository } from '../domain/interfaces/repositories/IAgentRepository.js';
import type { IProviderConfigRepository } from '../domain/interfaces/repositories/IProviderConfigRepository.js';
import type { IRunRepository } from '../domain/interfaces/repositories/IRunRepository.js';
import type { Session, SessionStatus } from '../domain/entities/Session.js';
import type { Message } from '../domain/entities/Message.js';
import { WorkflowExecutor } from '../engine/executor.js';
import { ProviderConfigService } from './provider-config.service.js';
import { NotFoundError, ForbiddenError } from '../utils/errors.js';

export interface ChatOptions {
  sessionId?: string;
  incognito?: boolean;
}

export interface ChatResult {
  sessionId: string | null;
  response: string;
  runId: string;
  isNewSession: boolean;
}

export class SessionService {
  private executor: WorkflowExecutor;
  private providerConfigService: ProviderConfigService;

  constructor(
    private sessionRepo: ISessionRepository,
    private messageRepo: IMessageRepository,
    private agentRepo: IAgentRepository,
    private runRepo: IRunRepository,
    providerConfigRepo: IProviderConfigRepository
  ) {
    this.executor = new WorkflowExecutor(runRepo);
    this.providerConfigService = new ProviderConfigService(providerConfigRepo);
  }

  /**
   * Chat with an agent - auto-creates session if not provided
   */
  async chat(
    userId: string,
    agentId: string,
    message: string,
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
    let isNewSession = false;
    let history: Message[] = [];

    // Get or create session
    if (sessionId) {
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
      // Get existing conversation history
      if (!session.incognito) {
        history = await this.messageRepo.findBySessionId(sessionId, { order: 'asc' });
      }
    } else if (!incognito) {
      // Create new session
      session = await this.sessionRepo.create({
        userId,
        agentId,
        incognito: false,
      });
      isNewSession = true;
    }

    // Save user message if not incognito
    if (session && !session.incognito) {
      await this.messageRepo.create({
        sessionId: session.id,
        role: 'user',
        content: message,
      });
    }

    // Format history for the agent
    const formattedHistory = this.formatHistoryForAgent(history);

    // Build provider config
    const providers = await this.providerConfigService.buildExecutionConfig(userId);

    // Execute agent with conversation context
    const run = await this.executor.execute(
      agent,
      {
        message,
        conversationHistory: formattedHistory,
        isConversation: true,
      },
      userId,
      {
        providers,
        agentRepo: this.agentRepo,
        runRepo: this.runRepo,
        userId,
        callStack: new Set([agent.id]),
      }
    );

    // Extract assistant response
    const response = this.extractAssistantResponse(run.output);

    // Save assistant message if not incognito
    if (session && !session.incognito) {
      await this.messageRepo.create({
        sessionId: session.id,
        role: 'assistant',
        content: response,
      });
    }

    return {
      sessionId: session?.id ?? null,
      response,
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

  async list(
    userId: string,
    options?: { status?: SessionStatus; limit?: number; offset?: number }
  ): Promise<Session[]> {
    return this.sessionRepo.findByUserId(userId, options);
  }

  async delete(userId: string, sessionId: string): Promise<void> {
    const session = await this.getById(userId, sessionId);
    await this.messageRepo.deleteBySessionId(session.id);
    await this.sessionRepo.delete(session.id);
  }

  async getMessages(
    userId: string,
    sessionId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<Message[]> {
    await this.getById(userId, sessionId);
    return this.messageRepo.findBySessionId(sessionId, { ...options, order: 'asc' });
  }

  private formatHistoryForAgent(messages: Message[]): string {
    if (messages.length === 0) {
      return '';
    }

    return messages
      .map((msg) => {
        const role = msg.role === 'user' ? 'User' : 'Assistant';
        return `${role}: ${msg.content}`;
      })
      .join('\n\n');
  }

  private extractAssistantResponse(output: Record<string, unknown> | null): string {
    if (!output) {
      return 'No response generated.';
    }

    // Try common output field names
    if (typeof output.response === 'string') {
      return output.response;
    }
    if (typeof output.value === 'string') {
      return output.value;
    }
    if (output.value && typeof (output.value as Record<string, unknown>).response === 'string') {
      return (output.value as Record<string, unknown>).response as string;
    }

    // Fallback to JSON stringified output
    return JSON.stringify(output);
  }
}
