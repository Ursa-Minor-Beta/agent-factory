import type { WorkflowNode } from '../../../domain/entities/Agent.js';
import type { ExecutionContext } from '../../context.js';
import { BaseNode, type NodeExecutionResult, type ExecutionOptions, type ChatMessage } from '../base.js';
import { interpolateAll } from '../utils.js';
import { callOpenAI } from './openai.js';
import { callAnthropic } from './anthropic.js';
import { callOllama } from './ollama.js';
import type { LLMNodeData } from './types.js';
import { DEFAULT_MAX_MESSAGES } from './constants.js';

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

  async execute(
    node: WorkflowNode,
    context: ExecutionContext,
    options: ExecutionOptions
  ): Promise<NodeExecutionResult> {
    const data = node.data as unknown as LLMNodeData;
    const interpolateOpts = { context };

    const systemPrompt = data.systemPrompt
      ? interpolateAll(data.systemPrompt, interpolateOpts)
      : undefined;
      
    const userPrompt = data.userPrompt
      ? interpolateAll(data.userPrompt, interpolateOpts)
      : '';

    const maxMessages = data.maxMessages ?? DEFAULT_MAX_MESSAGES;
    const conversationHistory = maxMessages > 0
      ? await this.getConversationHistory(maxMessages, options)
      : [];

    const finalSystemPrompt = this.buildSystemPrompt(
      systemPrompt,
      options.sessionNotes,
      !!options.sessionId
    );

    let result;
    switch (data.provider) {
      case 'openai':
        result = await callOpenAI(data, finalSystemPrompt, userPrompt, conversationHistory, options, node.id);
        break;
      case 'anthropic':
        result = await callAnthropic(data, finalSystemPrompt, userPrompt, conversationHistory, options, node.id);
        break;
      case 'ollama':
        result = await callOllama(data, finalSystemPrompt, userPrompt, conversationHistory, options);
        break;
      default:
        throw new Error(`Unknown LLM provider: ${data.provider}`);
    }

    const outputs: Record<string, unknown> = {
      response: result.response,
      usage: result.usage,
    };
    if (result.toolCalls) {
      outputs.toolCalls = result.toolCalls;
    }

    context.setOutput(node.id, 'response', result.response);
    context.setOutput(node.id, 'usage', result.usage);
    if (result.toolCalls) {
      context.setOutput(node.id, 'toolCalls', result.toolCalls);
    }

    return { outputs };
  }
}

// Re-export types
export type { LLMNodeData, ProviderCallResult, ExecutedToolCall, TokenUsage } from './types.js';
