import OpenAI from 'openai';
import type { ChatMessage, ExecutionOptions } from '../base.js';
import type { ToolDefinition } from '../../tools/index.js';
import { NodeExecutionError } from '../../../utils/errors.js';
import { extractImagesFromText } from '../../../utils/file-extractor.js';
import { executeBuiltinTool } from './builtin-tools.js';
import { executeSubAgent } from './sub-agent.js';
import type { LLMNodeData, ProviderCallResult, ExecutedToolCall } from './types.js';
import {
  DEFAULT_OPENAI_MODEL,
  DEFAULT_TEMPERATURE,
  DEFAULT_MAX_TOKENS,
  DEFAULT_MAX_TOOL_CALLS,
} from './constants.js';
import { buildToolErrorSummary } from './utils.js';

type ToolCallResult = {
  toolCallId: string;
  name: string;
  result: unknown;
  isError: boolean;
};

/**
 * Execute a single OpenAI tool call
 */
async function executeSingleToolCall(
  toolCall: OpenAI.Chat.ChatCompletionMessageToolCall,
  toolMap: Map<string, ToolDefinition>,
  options: ExecutionOptions,
  nodeId: string
): Promise<ToolCallResult> {
  const toolName = toolCall.function.name;
  const toolDef = toolMap.get(toolName);

  if (!toolDef) {
    return {
      toolCallId: toolCall.id,
      name: toolName,
      result: { error: `Unknown tool: ${toolName}` },
      isError: true,
    };
  }

  let toolArgs: Record<string, unknown>;
  try {
    toolArgs = JSON.parse(toolCall.function.arguments);
  } catch {
    return {
      toolCallId: toolCall.id,
      name: toolName,
      result: { error: 'Invalid JSON in tool arguments' },
      isError: true,
    };
  }

  try {
    const result = toolDef.type === 'builtin'
      ? await executeBuiltinTool(toolName, toolArgs, options)
      : await executeSubAgent(toolDef.agentId!, toolArgs, options, nodeId, toolName);

    return { toolCallId: toolCall.id, name: toolName, result, isError: false };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      toolCallId: toolCall.id,
      name: toolName,
      result: { error: errorMessage },
      isError: true,
    };
  }
}

/**
 * Build initial messages array with system prompt, history, and user message
 */
function buildInitialMessages(
  systemPrompt: string | undefined,
  conversationHistory: ChatMessage[],
  userPrompt: string
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }

  for (const msg of conversationHistory) {
    messages.push({ role: msg.role, content: msg.content });
  }

  const { text: cleanedPrompt, images } = extractImagesFromText(userPrompt);
  if (images.length > 0) {
    const content: OpenAI.Chat.ChatCompletionContentPart[] = images.map((img) => ({
      type: 'image_url' as const,
      image_url: { url: `data:${img.mimeType};base64,${img.data}` },
    }));
    if (cleanedPrompt) {
      content.push({ type: 'text', text: cleanedPrompt });
    }
    messages.push({ role: 'user', content });
  } else {
    messages.push({ role: 'user', content: userPrompt });
  }

  return messages;
}

interface ApiCallParams {
  client: OpenAI;
  model: string;
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
  temperature: number;
  maxTokens: number;
  usesLegacyMaxTokens: boolean;
  tools: OpenAI.Chat.ChatCompletionTool[] | undefined;
}

/**
 * Make a single API call to OpenAI, wrapping errors
 */
async function makeApiCall(params: ApiCallParams): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const { client, model, messages, temperature, maxTokens, usesLegacyMaxTokens, tools } = params;

  try {
    return await client.chat.completions.create({
      model,
      messages,
      temperature,
      ...(usesLegacyMaxTokens ? { max_tokens: maxTokens } : { max_completion_tokens: maxTokens }),
      tools,
    });
  } catch (error) {
    if (error instanceof OpenAI.APIError) {
      throw new NodeExecutionError(
        `OpenAI API error: ${error.status} ${error.message}`,
        { response: { status: error.status, body: error.message } }
      );
    }
    throw error;
  }
}

/**
 * Call OpenAI API with tool support
 */
export async function callOpenAI(
  data: LLMNodeData,
  systemPrompt: string | undefined,
  userPrompt: string,
  conversationHistory: ChatMessage[],
  options: ExecutionOptions,
  nodeId: string
): Promise<ProviderCallResult> {
  const apiKey = options.providers.openai?.apiKey;
  if (!apiKey) {
    throw new NodeExecutionError('OpenAI API provider not configured', {});
  }

  const client = new OpenAI({
    apiKey,
    baseURL: options.providers.openai?.baseUrl,
  });

  const messages = buildInitialMessages(systemPrompt, conversationHistory, userPrompt);

  // Convert tools to OpenAI format
  const openaiTools: OpenAI.Chat.ChatCompletionTool[] | undefined = data.tools?.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));

  const toolMap = new Map<string, ToolDefinition>();
  data.tools?.forEach((tool) => toolMap.set(tool.name, tool));

  // Prepare API call params
  const model = data.model || DEFAULT_OPENAI_MODEL;
  const usesLegacyMaxTokens = /^gpt-(3\.5|4(?!o))/.test(model);
  const apiParams: ApiCallParams = {
    client,
    model,
    messages,
    temperature: data.temperature ?? DEFAULT_TEMPERATURE,
    maxTokens: data.maxTokens ?? DEFAULT_MAX_TOKENS,
    usesLegacyMaxTokens,
    tools: openaiTools,
  };

  const maxIterations = data.maxToolCalls ?? DEFAULT_MAX_TOOL_CALLS;
  const totalUsage = { inputTokens: 0, outputTokens: 0 };
  const executedToolCalls: ExecutedToolCall[] = [];
  let iterations = 0;

  // Tool loop: call API until no more tool calls or max iterations
  while (true) {
    // Guard: max iterations exceeded
    if (iterations >= maxIterations) {
      throw new NodeExecutionError(
        `Exceeded maximum tool call iterations (${maxIterations}).\nTools called:\n${buildToolErrorSummary(executedToolCalls)}`,
        { toolCalls: executedToolCalls }
      );
    }
    iterations++;

    const completion = await makeApiCall(apiParams);
    totalUsage.inputTokens += completion.usage?.prompt_tokens ?? 0;
    totalUsage.outputTokens += completion.usage?.completion_tokens ?? 0;

    const choice = completion.choices[0];
    if (!choice) {
      throw new NodeExecutionError('OpenAI returned no choices', {});
    }

    const assistantMessage = choice.message;
    const toolCalls = assistantMessage.tool_calls ?? [];

    // Done: no tool calls requested
    if (toolCalls.length === 0) {
      return {
        response: assistantMessage.content ?? '',
        usage: totalUsage,
        toolCalls: executedToolCalls.length > 0 ? executedToolCalls : undefined,
      };
    }

    // Execute tools and continue loop
    messages.push(assistantMessage);
    for (const toolCall of toolCalls) {
      const callResult = await executeSingleToolCall(toolCall, toolMap, options, nodeId);
      executedToolCalls.push({ name: callResult.name, result: callResult.result });
      messages.push({
        role: 'tool',
        tool_call_id: callResult.toolCallId,
        content: JSON.stringify(callResult.result),
      });
    }
  }
}
