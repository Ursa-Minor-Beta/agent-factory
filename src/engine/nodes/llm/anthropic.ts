import Anthropic from '@anthropic-ai/sdk';
import type { ChatMessage, ExecutionOptions } from '../base.js';
import type { ToolDefinition } from '../../tools/index.js';
import { NodeExecutionError } from '../../../utils/errors.js';
import { extractImagesFromText } from '../../../utils/file-extractor.js';
import { executeBuiltinTool } from './builtin-tools/index.js';
import { executeSubAgent } from './sub-agent.js';
import type { LLMNodeData, ProviderCallResult, ExecutedToolCall } from './types.js';
import {
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_MAX_TOKENS,
  DEFAULT_MAX_TOOL_CALLS,
} from './constants.js';
import { buildToolErrorSummary, resolveTools } from './utils.js';

type ToolCallResult = {
  toolUseId: string;
  name: string;
  result: unknown;
};

/**
 * Execute a single Anthropic tool call
 */
async function executeSingleToolCall(
  toolUse: Anthropic.ToolUseBlock,
  toolMap: Map<string, ToolDefinition>,
  options: ExecutionOptions,
  nodeId: string
): Promise<ToolCallResult> {
  const toolDef = toolMap.get(toolUse.name);

  if (!toolDef) {
    return {
      toolUseId: toolUse.id,
      name: toolUse.name,
      result: { error: `Unknown tool: ${toolUse.name}` },
    };
  }

  try {
    const result = toolDef.type === 'builtin'
      ? await executeBuiltinTool(toolUse.name, toolUse.input as Record<string, unknown>, options)
      : await executeSubAgent(toolDef.agentId!, toolUse.input as Record<string, unknown>, options, nodeId, toolUse.name);

    return { toolUseId: toolUse.id, name: toolUse.name, result };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { toolUseId: toolUse.id, name: toolUse.name, result: { error: errorMessage } };
  }
}

/**
 * Build initial messages array with history and user message
 */
function buildInitialMessages(
  conversationHistory: ChatMessage[],
  userPrompt: string
): Anthropic.MessageParam[] {
  const messages: Anthropic.MessageParam[] = [];

  for (const msg of conversationHistory) {
    messages.push({ role: msg.role, content: msg.content });
  }

  const { text: cleanedPrompt, images } = extractImagesFromText(userPrompt);
  if (images.length > 0) {
    const content: Array<Anthropic.ImageBlockParam | Anthropic.TextBlockParam> = images.map((img) => ({
      type: 'image' as const,
      source: {
        type: 'base64' as const,
        media_type: img.mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
        data: img.data,
      },
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

/**
 * Make a single API call to Anthropic, wrapping errors
 */
async function makeApiCall(
  client: Anthropic,
  model: string,
  maxTokens: number,
  systemPrompt: string | undefined,
  messages: Anthropic.MessageParam[],
  tools: Anthropic.Tool[] | undefined
): Promise<Anthropic.Message> {
  try {
    return await client.messages.create({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
      tools,
    });
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      throw new NodeExecutionError(
        `Anthropic API error: ${error.status} ${error.message}`,
        { response: { status: error.status, body: error.message } }
      );
    }
    throw error;
  }
}

/**
 * Extract text response from Anthropic message
 */
function extractTextResponse(content: Anthropic.ContentBlock[]): string {
  const textBlock = content.find(
    (block): block is Anthropic.TextBlock => block.type === 'text'
  );
  return textBlock?.text ?? '';
}

/**
 * Extract tool uses from Anthropic message
 */
function extractToolUses(content: Anthropic.ContentBlock[]): Anthropic.ToolUseBlock[] {
  return content.filter(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
  );
}

/**
 * Call Anthropic API with tool support
 */
export async function callAnthropic(
  data: LLMNodeData,
  systemPrompt: string | undefined,
  userPrompt: string,
  conversationHistory: ChatMessage[],
  options: ExecutionOptions,
  nodeId: string
): Promise<ProviderCallResult> {
  const apiKey = options.providers.anthropic?.apiKey;
  if (!apiKey) {
    throw new NodeExecutionError('Anthropic API provider not configured', {});
  }

  const client = new Anthropic({
    apiKey,
    baseURL: options.providers.anthropic?.baseUrl,
  });

  // Resolve builtin tools to get their full definitions (with parameters)
  const resolvedTools = resolveTools(data.tools);

  // Convert tools to Anthropic format
  const anthropicTools: Anthropic.Tool[] | undefined = resolvedTools?.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters as Anthropic.Tool.InputSchema,
  }));

  const toolMap = new Map<string, ToolDefinition>();
  resolvedTools?.forEach((tool) => toolMap.set(tool.name, tool));

  const messages = buildInitialMessages(conversationHistory, userPrompt);
  const model = data.model || DEFAULT_ANTHROPIC_MODEL;
  const maxTokens = data.maxTokens ?? DEFAULT_MAX_TOKENS;
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

    const response = await makeApiCall(client, model, maxTokens, systemPrompt, messages, anthropicTools);
    totalUsage.inputTokens += response.usage.input_tokens;
    totalUsage.outputTokens += response.usage.output_tokens;

    const toolUses = extractToolUses(response.content);

    // Done: no tool calls requested
    if (toolUses.length === 0) {
      return {
        response: extractTextResponse(response.content),
        usage: totalUsage,
        toolCalls: executedToolCalls.length > 0 ? executedToolCalls : undefined,
      };
    }

    // Execute tools and continue loop
    messages.push({ role: 'assistant', content: response.content });
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const toolUse of toolUses) {
      const callResult = await executeSingleToolCall(toolUse, toolMap, options, nodeId);
      executedToolCalls.push({ name: callResult.name, result: callResult.result });
      toolResults.push({
        type: 'tool_result',
        tool_use_id: callResult.toolUseId,
        content: JSON.stringify(callResult.result),
      });
    }
    messages.push({ role: 'user', content: toolResults });
  }
}
