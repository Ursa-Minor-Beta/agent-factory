import Anthropic from '@anthropic-ai/sdk';
import type { ChatMessage, ExecutionOptions, ResolvedProvider } from '../base.js';
import type { ToolDefinition } from '../../tools/index.js';
import { NodeExecutionError } from '../../../utils/errors.js';
import { extractImagesFromText } from '../../../utils/file-extractor.js';
import type { LLMNodeData, ProviderCallResult, ExecutedToolCall } from './types.js';
import {
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_MAX_TOKENS,
  DEFAULT_MAX_TOOL_CALLS,
  DEFAULT_TOOL_EXECUTION_MODE,
} from './constants.js';
import { applyExtraParams, buildToolErrorSummary, resolveTools, executeClientTool, executeServerTool } from './utils.js';
import { config } from '../../../config/index.js';
import { mcpToolCallName, type McpServerConfig } from './mcp.js';

const MCP_BETA = 'mcp-client-2025-04-04';

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
    const result = toolDef.type === 'client'
      ? await executeClientTool(toolUse.id, toolUse.name, toolUse.input as Record<string, unknown>, options)
      : await executeServerTool(toolUse.id, toolDef, toolUse.input as Record<string, unknown>, options, nodeId);

    return { toolUseId: toolUse.id, name: toolUse.name, result };
  }
  catch (error) {
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
  }
  else {
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
  tools: Anthropic.Tool[] | undefined,
  extraParams: Record<string, unknown> | undefined,
  mcpServers: McpServerConfig[] | undefined
): Promise<Anthropic.Message> {
  const body = applyExtraParams({
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages,
    tools,
    stream: false as const,
  }, extraParams);

  try {
    if (!mcpServers) {
      return await client.messages.create(body);
    }
    // MCP connector (beta): Anthropic calls the servers and returns mcp_tool_use/mcp_tool_result blocks
    const response = await client.beta.messages.create({
      ...(body as Anthropic.Beta.MessageCreateParamsNonStreaming),
      betas: [MCP_BETA],
      mcp_servers: mcpServers.map((server) => ({
        type: 'url' as const,
        name: server.name,
        url: server.url,
        authorization_token: server.authorizationToken,
        tool_configuration: server.allowedTools ? { allowed_tools: server.allowedTools } : undefined,
      })),
    });
    // Beta content is a superset; MCP blocks are passed back as-is in the conversation
    return response as unknown as Anthropic.Message;
  }
  catch (error) {
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
  // With MCP calls the answer follows the last mcp_tool_result; earlier text is preamble
  const lastMcpResult = content.map((block) => block.type as string).lastIndexOf('mcp_tool_result');
  if (lastMcpResult >= 0) {
    return content
      .slice(lastMcpResult + 1)
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n\n');
  }

  const textBlock = content.find(
    (block): block is Anthropic.TextBlock => block.type === 'text'
  );
  return textBlock?.text ?? '';
}

/**
 * Collect MCP calls executed by Anthropic (mcp_tool_use paired with its mcp_tool_result)
 */
function extractMcpToolCalls(content: Anthropic.ContentBlock[]): ExecutedToolCall[] {
  const blocks = content as unknown as Anthropic.Beta.BetaContentBlock[];
  const results = new Map<string, Anthropic.Beta.BetaMCPToolResultBlock>();
  for (const block of blocks) {
    if (block.type === 'mcp_tool_result') results.set(block.tool_use_id, block);
  }

  return blocks
    .filter((block): block is Anthropic.Beta.BetaMCPToolUseBlock => block.type === 'mcp_tool_use')
    .map((block) => {
      const result = results.get(block.id);
      return {
        id: block.id,
        name: mcpToolCallName(block.server_name, block.name),
        input: (block.input ?? {}) as Record<string, unknown>,
        result: result
          ? (result.is_error ? { error: result.content } : result.content)
          : { error: 'No result returned' },
      };
    });
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
  provider: ResolvedProvider,
  systemPrompt: string | undefined,
  userPrompt: string,
  conversationHistory: ChatMessage[],
  options: ExecutionOptions,
  nodeId: string
): Promise<ProviderCallResult> {
  const client = new Anthropic({
    apiKey: provider.apiKey,
    baseURL: provider.baseUrl,
  });

  // Resolve builtin tools to get their full definitions (with parameters)
  const resolvedTools = resolveTools(data.tools, options.clientTools, nodeId);

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
  // Config limit overrides node settings if defined
  const nodeMaxToolCalls = data.maxToolCalls ?? DEFAULT_MAX_TOOL_CALLS;
  const maxIterations = config.llm.maxToolCalls !== undefined
    ? Math.min(nodeMaxToolCalls, config.llm.maxToolCalls)
    : nodeMaxToolCalls;

  const totalUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
  };
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

    const response = await makeApiCall(client, model, maxTokens, systemPrompt, messages, anthropicTools, data.extraParams, data.mcpServers);
    totalUsage.inputTokens += response.usage.input_tokens;
    totalUsage.outputTokens += response.usage.output_tokens;
    // Anthropic-specific: cache tokens (may not be present in all responses)
    const usageWithCache = response.usage as {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
    totalUsage.cacheCreationTokens += usageWithCache.cache_creation_input_tokens ?? 0;
    totalUsage.cacheReadTokens += usageWithCache.cache_read_input_tokens ?? 0;

    executedToolCalls.push(...extractMcpToolCalls(response.content));

    // Long server-side (MCP) turn paused: resend with the partial assistant turn to let it continue
    if ((response.stop_reason as string) === 'pause_turn') {
      messages.push({ role: 'assistant', content: response.content });
      continue;
    }

    const toolUses = extractToolUses(response.content);

    // Done: no tool calls requested
    if (toolUses.length === 0) {
      // Build usage object, only include optional fields if non-zero
      const usage: ProviderCallResult['usage'] = {
        inputTokens: totalUsage.inputTokens,
        outputTokens: totalUsage.outputTokens,
      };
      if (totalUsage.cacheCreationTokens > 0) usage.cacheCreationTokens = totalUsage.cacheCreationTokens;
      if (totalUsage.cacheReadTokens > 0) usage.cacheReadTokens = totalUsage.cacheReadTokens;

      return {
        response: extractTextResponse(response.content),
        usage,
        toolCalls: executedToolCalls.length > 0 ? executedToolCalls : undefined,
      };
    }

    // Execute tools and continue loop
    messages.push({ role: 'assistant', content: response.content });
    const executionMode = data.toolExecutionMode ?? DEFAULT_TOOL_EXECUTION_MODE;
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    if (executionMode === 'sequential') {
      // Execute tools one by one
      for (const toolUse of toolUses) {
        const callResult = await executeSingleToolCall(toolUse, toolMap, options, nodeId);
        executedToolCalls.push({ id: toolUse.id, name: callResult.name, input: toolUse.input as Record<string, unknown>, result: callResult.result });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: callResult.toolUseId,
          content: JSON.stringify(callResult.result),
        });
      }
    }
    else {
      // Execute tools in parallel
      const callResults = await Promise.all(
        toolUses.map((toolUse) => executeSingleToolCall(toolUse, toolMap, options, nodeId))
      );

      for (let i = 0; i < toolUses.length; i++) {
        const toolUse = toolUses[i]!;
        const callResult = callResults[i]!;
        executedToolCalls.push({ id: toolUse.id, name: callResult.name, input: toolUse.input as Record<string, unknown>, result: callResult.result });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: callResult.toolUseId,
          content: JSON.stringify(callResult.result),
        });
      }
    }
    messages.push({ role: 'user', content: toolResults });
  }
}
