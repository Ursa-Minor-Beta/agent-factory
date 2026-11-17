import OpenAI from 'openai';
import type { ChatMessage, ExecutionOptions, ResolvedProvider } from '../base.js';
import type { ToolDefinition } from '../../tools/index.js';
import { NodeExecutionError } from '../../../utils/errors.js';
import { extractImagesFromText } from '../../../utils/file-extractor.js';
import type { LLMNodeData, ProviderCallResult, ExecutedToolCall } from './types.js';
import {
  DEFAULT_OPENAI_MODEL,
  DEFAULT_TEMPERATURE,
  DEFAULT_MAX_TOKENS,
  DEFAULT_MAX_TOOL_CALLS,
  DEFAULT_TOOL_EXECUTION_MODE,
} from './constants.js';
import { applyExtraParams, buildToolErrorSummary, resolveTools, executeClientTool, executeServerTool } from './utils.js';
import { config } from '../../../config/index.js';

type ToolCallResult = {
  callId: string;
  name: string;
  input: Record<string, unknown>;
  result: unknown;
};

/**
 * Execute a single Responses API function call
 */
async function executeSingleToolCall(
  toolCall: OpenAI.Responses.ResponseFunctionToolCall,
  toolMap: Map<string, ToolDefinition>,
  options: ExecutionOptions,
  nodeId: string
): Promise<ToolCallResult> {
  const toolName = toolCall.name;
  const toolDef = toolMap.get(toolName);
  const base = { callId: toolCall.call_id, name: toolName };

  let toolArgs: Record<string, unknown>;
  try {
    toolArgs = JSON.parse(toolCall.arguments || '{}');
  }
  catch {
    return { ...base, input: {}, result: { error: 'Invalid JSON in tool arguments' } };
  }

  if (!toolDef) {
    return { ...base, input: toolArgs, result: { error: `Unknown tool: ${toolName}` } };
  }

  try {
    const result = toolDef.type === 'client'
      ? await executeClientTool(toolCall.call_id, toolName, toolArgs, options)
      : await executeServerTool(toolCall.call_id, toolDef, toolArgs, options, nodeId);

    return { ...base, input: toolArgs, result };
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { ...base, input: toolArgs, result: { error: errorMessage } };
  }
}

/**
 * Build initial input items with history and user message (system prompt goes to `instructions`)
 */
function buildInitialInput(
  conversationHistory: ChatMessage[],
  userPrompt: string
): OpenAI.Responses.ResponseInputItem[] {
  const input: OpenAI.Responses.ResponseInputItem[] = [];

  for (const msg of conversationHistory) {
    input.push({ role: msg.role, content: msg.content });
  }

  const { text: cleanedPrompt, images } = extractImagesFromText(userPrompt);
  if (images.length > 0) {
    const content: OpenAI.Responses.ResponseInputContent[] = images.map((img) => ({
      type: 'input_image' as const,
      image_url: `data:${img.mimeType};base64,${img.data}`,
      detail: 'auto' as const,
    }));
    if (cleanedPrompt) {
      content.push({ type: 'input_text', text: cleanedPrompt });
    }
    input.push({ role: 'user', content });
  }
  else {
    input.push({ role: 'user', content: userPrompt });
  }

  return input;
}

interface ApiCallParams {
  client: OpenAI;
  model: string;
  instructions: string | undefined;
  input: OpenAI.Responses.ResponseInputItem[];
  temperature: number;
  maxTokens: number;
  tools: OpenAI.Responses.Tool[] | undefined;
  extraParams: Record<string, unknown> | undefined;
}

/**
 * Make a single Responses API call, wrapping errors
 */
async function makeApiCall(params: ApiCallParams): Promise<OpenAI.Responses.Response> {
  const { client, model, instructions, input, temperature, maxTokens, tools, extraParams } = params;

  try {
    return await client.responses.create(applyExtraParams({
      model,
      instructions,
      input,
      temperature,
      max_output_tokens: maxTokens,
      tools,
      // Stateless: full input is resent each iteration, nothing stored on OpenAI side
      store: false,
      stream: false as const,
    }, extraParams));
  }
  catch (error) {
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
 * Call OpenAI Responses API with tool support
 */
export async function callOpenAIResponses(
  data: LLMNodeData,
  provider: ResolvedProvider,
  systemPrompt: string | undefined,
  userPrompt: string,
  conversationHistory: ChatMessage[],
  options: ExecutionOptions,
  nodeId: string
): Promise<ProviderCallResult> {
  const client = new OpenAI({
    apiKey: provider.apiKey,
    baseURL: provider.baseUrl,
  });

  const input = buildInitialInput(conversationHistory, userPrompt);

  // Resolve builtin tools to get their full definitions (with parameters)
  const resolvedTools = resolveTools(data.tools, options.clientTools, nodeId);

  // Convert tools to Responses format (flat function definitions)
  const responsesTools: OpenAI.Responses.Tool[] | undefined = resolvedTools?.map((tool) => ({
    type: 'function' as const,
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters as Record<string, unknown>,
    strict: false,
  }));

  const toolMap = new Map<string, ToolDefinition>();
  resolvedTools?.forEach((tool) => toolMap.set(tool.name, tool));

  const apiParams: ApiCallParams = {
    client,
    model: data.model || DEFAULT_OPENAI_MODEL,
    instructions: systemPrompt,
    input,
    temperature: data.temperature ?? DEFAULT_TEMPERATURE,
    maxTokens: data.maxTokens ?? DEFAULT_MAX_TOKENS,
    tools: responsesTools,
    extraParams: data.extraParams,
  };

  // Config limit overrides node settings if defined
  const nodeMaxToolCalls = data.maxToolCalls ?? DEFAULT_MAX_TOOL_CALLS;
  const maxIterations = config.llm.maxToolCalls !== undefined
    ? Math.min(nodeMaxToolCalls, config.llm.maxToolCalls)
    : nodeMaxToolCalls;
  const totalUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cachedTokens: 0,
    reasoningTokens: 0,
  };
  const executedToolCalls: ExecutedToolCall[] = [];
  let iterations = 0;

  // Tool loop: call API until no more function calls or max iterations
  while (true) {
    // Guard: max iterations exceeded
    if (iterations >= maxIterations) {
      throw new NodeExecutionError(
        `Exceeded maximum tool call iterations (${maxIterations}).\nTools called:\n${buildToolErrorSummary(executedToolCalls)}`,
        { toolCalls: executedToolCalls }
      );
    }
    iterations++;

    const response = await makeApiCall(apiParams);
    totalUsage.inputTokens += response.usage?.input_tokens ?? 0;
    totalUsage.outputTokens += response.usage?.output_tokens ?? 0;
    totalUsage.cachedTokens += response.usage?.input_tokens_details?.cached_tokens ?? 0;
    totalUsage.reasoningTokens += response.usage?.output_tokens_details?.reasoning_tokens ?? 0;

    if (response.error) {
      throw new NodeExecutionError(`OpenAI API error: ${response.error.code} ${response.error.message}`, {});
    }

    const toolCalls = response.output.filter(
      (item): item is OpenAI.Responses.ResponseFunctionToolCall => item.type === 'function_call'
    );

    // Done: no function calls requested
    if (toolCalls.length === 0) {
      // Build usage object, only include optional fields if non-zero
      const usage: ProviderCallResult['usage'] = {
        inputTokens: totalUsage.inputTokens,
        outputTokens: totalUsage.outputTokens,
      };
      if (totalUsage.cachedTokens > 0) usage.cachedTokens = totalUsage.cachedTokens;
      if (totalUsage.reasoningTokens > 0) usage.reasoningTokens = totalUsage.reasoningTokens;

      return {
        response: response.output_text ?? '',
        usage,
        toolCalls: executedToolCalls.length > 0 ? executedToolCalls : undefined,
      };
    }

    // Echo model output (reasoning, function calls) back as input for the next turn
    input.push(...(response.output as OpenAI.Responses.ResponseInputItem[]));
    const executionMode = data.toolExecutionMode ?? DEFAULT_TOOL_EXECUTION_MODE;

    const callResults: ToolCallResult[] = [];
    if (executionMode === 'sequential') {
      for (const toolCall of toolCalls) {
        callResults.push(await executeSingleToolCall(toolCall, toolMap, options, nodeId));
      }
    }
    else {
      callResults.push(...await Promise.all(
        toolCalls.map((toolCall) => executeSingleToolCall(toolCall, toolMap, options, nodeId))
      ));
    }

    for (const callResult of callResults) {
      executedToolCalls.push({ id: callResult.callId, name: callResult.name, input: callResult.input, result: callResult.result });
      input.push({
        type: 'function_call_output',
        call_id: callResult.callId,
        output: JSON.stringify(callResult.result),
      });
    }
  }
}
