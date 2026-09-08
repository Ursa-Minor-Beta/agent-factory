import type { WorkflowNode } from '../../domain/entities/Agent.js';
import type { ExecutionContext } from '../context.js';
import { BaseNode, type NodeExecutionResult, type ExecutionOptions } from './base.js';
import { NodeExecutionError } from '../../utils/errors.js';
import { interpolate } from './utils.js';

interface LLMNodeData {
  provider: 'openai' | 'anthropic' | 'ollama';
  model: string;
  systemPrompt?: string;
  userPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * LLM node - Call language model APIs
 */
export class LlmNode extends BaseNode {
  readonly type = 'llm';

  async execute(
    node: WorkflowNode,
    context: ExecutionContext,
    options: ExecutionOptions
  ): Promise<NodeExecutionResult> {
    const data = node.data as unknown as LLMNodeData;
    const inputs = context.getAllInputs(node.id);

    // Merge workflow input with edge-resolved inputs for template interpolation
    // This allows using either original field names ({{text}}) or edge handles ({{prompt}})
    const templateValues = { ...options.workflowInput, ...inputs };

    // Interpolate prompts with input values
    const systemPrompt = data.systemPrompt
      ? interpolate(data.systemPrompt, templateValues)
      : undefined;
    const userPrompt = data.userPrompt
      ? interpolate(data.userPrompt, templateValues)
      : String(inputs.prompt ?? inputs.input ?? '');

    let response: string;
    let usage = { inputTokens: 0, outputTokens: 0 };

    switch (data.provider) {
      case 'openai':
        ({ response, usage } = await this.callOpenAI(data, systemPrompt, userPrompt, options));
        break;
      case 'anthropic':
        ({ response, usage } = await this.callAnthropic(data, systemPrompt, userPrompt, options));
        break;
      case 'ollama':
        ({ response, usage } = await this.callOllama(data, systemPrompt, userPrompt, options));
        break;
      default:
        throw new Error(`Unknown LLM provider: ${data.provider}`);
    }

    const outputs = { response, usage };
    context.setOutput(node.id, 'response', response);
    context.setOutput(node.id, 'usage', usage);

    return { outputs };
  }

  private async callOpenAI(
    data: LLMNodeData,
    systemPrompt: string | undefined,
    userPrompt: string,
    options: ExecutionOptions
  ): Promise<{ response: string; usage: { inputTokens: number; outputTokens: number } }> {
    const apiKey = options.providers.openai?.apiKey;
    if (!apiKey) {
      throw new NodeExecutionError('OpenAI API key not configured', {});
    }

    const messages: Array<{ role: string; content: string }> = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: userPrompt });

    const url = 'https://api.openai.com/v1/chat/completions';
    const requestBody = {
      model: data.model || 'gpt-4o-mini',
      messages,
      temperature: data.temperature ?? 0.7,
      max_tokens: data.maxTokens ?? 1000,
    };

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });
    } catch (error) {
      throw new NodeExecutionError(
        `OpenAI request failed: ${error instanceof Error ? error.message : String(error)}`,
        { request: { url, method: 'POST', body: { ...requestBody, messages: `[${messages.length} messages]` } } },
        error
      );
    }

    if (!res.ok) {
      const errorBody = await res.text();
      throw new NodeExecutionError(
        `OpenAI API error: ${res.status} ${res.statusText}`,
        {
          request: { url, method: 'POST', body: { ...requestBody, messages: `[${messages.length} messages]` } },
          response: { status: res.status, statusText: res.statusText, body: errorBody },
        }
      );
    }

    const json = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
      usage: { prompt_tokens: number; completion_tokens: number };
    };

    return {
      response: json.choices[0]?.message?.content ?? '',
      usage: {
        inputTokens: json.usage?.prompt_tokens ?? 0,
        outputTokens: json.usage?.completion_tokens ?? 0,
      },
    };
  }

  private async callAnthropic(
    data: LLMNodeData,
    systemPrompt: string | undefined,
    userPrompt: string,
    options: ExecutionOptions
  ): Promise<{ response: string; usage: { inputTokens: number; outputTokens: number } }> {
    const apiKey = options.providers.anthropic?.apiKey;
    if (!apiKey) {
      throw new NodeExecutionError('Anthropic API key not configured', {});
    }

    const url = 'https://api.anthropic.com/v1/messages';
    const requestBody = {
      model: data.model || 'claude-sonnet-4-20250514',
      max_tokens: data.maxTokens ?? 1000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    };

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(requestBody),
      });
    } catch (error) {
      throw new NodeExecutionError(
        `Anthropic request failed: ${error instanceof Error ? error.message : String(error)}`,
        { request: { url, method: 'POST', body: { ...requestBody, messages: '[1 message]' } } },
        error
      );
    }

    if (!res.ok) {
      const errorBody = await res.text();
      throw new NodeExecutionError(
        `Anthropic API error: ${res.status} ${res.statusText}`,
        {
          request: { url, method: 'POST', body: { ...requestBody, messages: '[1 message]' } },
          response: { status: res.status, statusText: res.statusText, body: errorBody },
        }
      );
    }

    const json = (await res.json()) as {
      content: Array<{ text: string }>;
      usage: { input_tokens: number; output_tokens: number };
    };

    return {
      response: json.content[0]?.text ?? '',
      usage: {
        inputTokens: json.usage?.input_tokens ?? 0,
        outputTokens: json.usage?.output_tokens ?? 0,
      },
    };
  }

  private async callOllama(
    data: LLMNodeData,
    systemPrompt: string | undefined,
    userPrompt: string,
    options: ExecutionOptions
  ): Promise<{ response: string; usage: { inputTokens: number; outputTokens: number } }> {
    const baseUrl = options.providers.ollama?.baseUrl ?? 'http://localhost:11434';

    const messages: Array<{ role: string; content: string }> = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: userPrompt });

    const url = `${baseUrl}/api/chat`;
    const requestBody = {
      model: data.model || 'llama3.2',
      messages,
      stream: false,
      options: {
        temperature: data.temperature ?? 0.7,
        num_predict: data.maxTokens ?? 1000,
      },
    };

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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
}
