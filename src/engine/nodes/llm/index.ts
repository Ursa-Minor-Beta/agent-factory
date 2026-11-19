import type { WorkflowNode } from '../../../domain/entities/Agent.js';
import type { ExecutionContext } from '../../context.js';
import { BaseNode, type NodeExecutionResult, type ExecutionOptions, type ChatMessage } from '../base.js';
import { interpolateAll, interpolateDeep } from '../interpolate.js';
import { callOpenAI } from './openai.js';
import { callOpenAIResponses } from './openai-responses.js';
import { callAnthropic } from './anthropic.js';
import { callOllama } from './ollama.js';
import type { LLMNodeData, ProviderAdapter } from './types.js';
import { DEFAULT_MAX_MESSAGES } from './constants.js';
import { resolveMcpServers } from './mcp.js';
import { extractAndStoreFiles, resolveTempRefsToBase64 } from '../file-helper.js';
import { NodeExecutionError } from '../../../utils/errors.js';
import { isLlmProviderType, type LlmProtocol } from '../../../domain/entities/ProviderConfig.js';

/** One adapter per wire protocol; providers (deepseek, groq, ...) map onto these via presets */
const PROTOCOL_ADAPTERS: Record<LlmProtocol, ProviderAdapter> = {
  'openai': callOpenAI,
  'openai-responses': callOpenAIResponses,
  'anthropic': callAnthropic,
  'ollama': callOllama,
};

/**
 * LLM node - Call language model APIs using official SDKs
 */
export class LlmNode extends BaseNode {
  readonly type = 'llm';

  /**
   * Build system prompt with session notes injected if available
   */
  private buildSystemPrompt(
    systemPrompt: string | undefined,
    sessionNotes: string | undefined,
    hasSession: boolean
  ): string | undefined {
    if (!hasSession) {
      return systemPrompt;
    }

    const notesInstruction = `\n\n## Session Notes (persistent memory)
Extract facts and call the update_session_notes tool.`;

    const notesSection = sessionNotes
      ? `${notesInstruction}\n\nCurrent notes:\n${sessionNotes}`
      : `${notesInstruction}\n\n(No notes yet)`;

    return systemPrompt ? systemPrompt + notesSection : notesSection.trim();
  }

  /**
   * Get conversation history from session (DB or incognito memory)
   */
  private async getConversationHistory(
    maxMessages: number,
    options: ExecutionOptions
  ): Promise<ChatMessage[]> {
    const isPersistedSession = options.sessionId && !options.sessionId.startsWith('incognito_');

    if (isPersistedSession && options.messageRepo) {
      const messages = await options.messageRepo.findBySessionId(
        options.sessionId!,
        { order: 'desc', limit: maxMessages, roles: ['user', 'assistant'], fields: ['role', 'content'] }
      );
      return messages.reverse() as ChatMessage[];
    }

    const allMessages = Array.isArray(options.messages) ? options.messages : [];
    return allMessages.slice(-maxMessages);
  }

  /**
   * Resolve the explicit `messages` option (array or template) into chat history
   */
  private resolveMessages(
    messages: ChatMessage[] | string,
    interpolateOpts: { context: ExecutionContext }
  ): ChatMessage[] {
    const resolved: unknown = interpolateDeep(messages, interpolateOpts);
    if (!Array.isArray(resolved)) {
      throw new NodeExecutionError('LLM option "messages" must resolve to an array of {role, content}', {});
    }
    return resolved.map((msg: unknown, i) => {
      const { role, content } = (msg ?? {}) as Record<string, unknown>;
      if (role !== 'user' && role !== 'assistant') {
        throw new NodeExecutionError(`LLM option "messages"[${i}].role must be "user" or "assistant"`, {});
      }
      return {
        role,
        content: typeof content === 'string' ? content : JSON.stringify(content ?? ''),
      };
    });
  }

  async execute(
    node: WorkflowNode,
    context: ExecutionContext,
    options: ExecutionOptions
  ): Promise<NodeExecutionResult> {
    const rawData = node.data as unknown as LLMNodeData;
    const interpolateOpts = { context };

    // provider and model may be templates (e.g. {{input.model}}, {{var:MODEL}})
    const data: LLMNodeData = {
      ...rawData,
      // validated below by isLlmProviderType
      provider: (rawData.provider
        ? interpolateAll(rawData.provider, interpolateOpts).trim()
        : rawData.provider) as LLMNodeData['provider'],
      model: rawData.model ? interpolateAll(rawData.model, interpolateOpts).trim() : rawData.model,
      extraParams: rawData.extraParams ? interpolateDeep(rawData.extraParams, interpolateOpts) : undefined,
    };

    const systemPrompt = data.systemPrompt
      ? interpolateAll(data.systemPrompt, interpolateOpts)
      : undefined;
      
    let userPrompt = data.userPrompt
      ? interpolateAll(data.userPrompt, interpolateOpts)
      : '';

    // Resolve any temp refs to base64 for vision APIs
    userPrompt = resolveTempRefsToBase64(userPrompt, context);

    const maxMessages = data.maxMessages ?? DEFAULT_MAX_MESSAGES;
    const conversationHistory = rawData.messages !== undefined && rawData.messages !== ''
      ? this.resolveMessages(rawData.messages, interpolateOpts)
      : maxMessages > 0
        ? await this.getConversationHistory(maxMessages, options)
        : [];

    const finalSystemPrompt = this.buildSystemPrompt(
      systemPrompt,
      options.sessionNotes,
      !!options.sessionId
    );

    if (!isLlmProviderType(data.provider)) {
      throw new NodeExecutionError(`Unknown LLM provider: ${data.provider}`, {});
    }
    const provider = options.providers[data.provider];
    if (!provider) {
      throw new NodeExecutionError(`LLM provider "${data.provider}" is not configured`, {});
    }

    data.mcpServers = resolveMcpServers(rawData.mcpServers, provider.protocol, {
      context,
      secrets: options.resolvedSecrets,
    });

    const adapter = PROTOCOL_ADAPTERS[provider.protocol];
    const result = await adapter(data, provider, finalSystemPrompt, userPrompt, conversationHistory, options, node.id);

    const outputs: Record<string, unknown> = {
      response: result.response,
      usage: result.usage,
    };
    if (result.toolCalls) {
      outputs.toolCalls = result.toolCalls;
    }

    // Extract files from response and tool calls, store in context with temp refs
    const { cleanedOutput, fileRefs } = extractAndStoreFiles(outputs, node.id, context);

    // Store cleaned outputs in context (with temp refs instead of base64)
    context.setOutput(node.id, 'response', (cleanedOutput as Record<string, unknown>).response);
    context.setOutput(node.id, 'usage', (cleanedOutput as Record<string, unknown>).usage);
    if ((cleanedOutput as Record<string, unknown>).toolCalls) {
      context.setOutput(node.id, 'toolCalls', (cleanedOutput as Record<string, unknown>).toolCalls);
    }

    return {
      outputs: cleanedOutput as Record<string, unknown>,
      files: fileRefs.length > 0 ? fileRefs : undefined,
    };
  }
}

// Re-export types
export type { LLMNodeData, ProviderCallResult, ExecutedToolCall, TokenUsage } from './types.js';
