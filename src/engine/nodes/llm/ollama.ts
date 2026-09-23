import type { ChatMessage, ExecutionOptions } from '../base.js';
import { NodeExecutionError } from '../../../utils/errors.js';
import type { LLMNodeData, ProviderCallResult } from './types.js';
import {
  DEFAULT_OLLAMA_MODEL,
  DEFAULT_TEMPERATURE,
  DEFAULT_MAX_TOKENS,
} from './constants.js';

/**
 * Call Ollama API (no tool support)
 */
export async function callOllama(
  data: LLMNodeData,
  systemPrompt: string | undefined,
  userPrompt: string,
  conversationHistory: ChatMessage[],
  options: ExecutionOptions
): Promise<ProviderCallResult> {
  const baseUrl = options.providers.ollama?.baseUrl;
  if (!baseUrl) {
    throw new NodeExecutionError('Ollama base URL not configured', {});
  }

  const messages: Array<{ role: string; content: string }> = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }

  for (const msg of conversationHistory) {
    messages.push({ role: msg.role, content: msg.content });
  }
  messages.push({ role: 'user', content: userPrompt });

  const url = `${baseUrl}/api/chat`;
  const requestBody = {
    model: data.model || DEFAULT_OLLAMA_MODEL,
    messages,
    stream: false,
    options: {
      temperature: data.temperature ?? DEFAULT_TEMPERATURE,
      num_predict: data.maxTokens ?? DEFAULT_MAX_TOKENS,
    },
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
  } catch (error) {
    throw new NodeExecutionError(
      `Ollama request failed: ${error instanceof Error ? error.message : String(error)}`,
      { request: { url, method: 'POST', body: { ...requestBody, messages: `[${messages.length} messages]` } } },
      error
    );
  }

  if (!res.ok) {
    const errorBody = await res.text();
    throw new NodeExecutionError(
      `Ollama API error: ${res.status} ${res.statusText}`,
      {
        request: { url, method: 'POST', body: { ...requestBody, messages: `[${messages.length} messages]` } },
        response: { status: res.status, statusText: res.statusText, body: errorBody },
      }
    );
  }

  const json = (await res.json()) as {
    message: { content: string };
    prompt_eval_count?: number;
    eval_count?: number;
  };

  return {
    response: json.message?.content ?? '',
    usage: {
      inputTokens: json.prompt_eval_count ?? 0,
      outputTokens: json.eval_count ?? 0,
    },
  };
}
