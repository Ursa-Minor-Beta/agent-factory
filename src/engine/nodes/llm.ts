import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import type { WorkflowNode } from '../../domain/entities/Agent.js';
import type { ExecutionContext } from '../context.js';
import { BaseNode, type NodeExecutionResult, type ExecutionOptions } from './base.js';
import { NodeExecutionError } from '../../utils/errors.js';
import { interpolate } from './utils.js';
import { WorkflowExecutor } from '../executor.js';

// Tool definition for LLM function calling
interface ToolDefinition {
  type: 'agent'; // For now, only agent tools. Can extend to 'function' later
  agentId: string;
  name: string; // Function name the LLM will call
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description?: string }>;
    required?: string[];
  };
}

interface LLMNodeData {
  provider: 'openai' | 'anthropic' | 'ollama';
  model: string;
  systemPrompt?: string;
  userPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  // Tool calling support
  tools?: ToolDefinition[];
  maxToolCalls?: number; // Limit iterations to prevent infinite loops
}

/**
 * LLM node - Call language model APIs using official SDKs
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
    let toolCalls: Array<{ name: string; result: unknown }> | undefined;

    switch (data.provider) {
      case 'openai':
        ({ response, usage, toolCalls } = await this.callOpenAI(data, systemPrompt, userPrompt, options));
        break;
      case 'anthropic':
        ({ response, usage, toolCalls } = await this.callAnthropic(data, systemPrompt, userPrompt, options));
        break;
      case 'ollama':
        ({ response, usage } = await this.callOllama(data, systemPrompt, userPrompt, options));
        break;
      default:
        throw new Error(`Unknown LLM provider: ${data.provider}`);
    }

    const outputs: Record<string, unknown> = { response, usage };
    if (toolCalls) {
      outputs.toolCalls = toolCalls;
    }

    context.setOutput(node.id, 'response', response);
    context.setOutput(node.id, 'usage', usage);
    if (toolCalls) {
      context.setOutput(node.id, 'toolCalls', toolCalls);
    }

    return { outputs };
  }

  private async callOpenAI(
    data: LLMNodeData,
    systemPrompt: string | undefined,
    userPrompt: string,
    options: ExecutionOptions
  ): Promise<{ response: string; usage: { inputTokens: number; outputTokens: number }; toolCalls?: Array<{ name: string; result: unknown }> }> {
    const apiKey = options.providers.openai?.apiKey;
    if (!apiKey) {
      throw new NodeExecutionError('OpenAI API key not configured', {});
    }

    const client = new OpenAI({
      apiKey,
      baseURL: options.providers.openai?.baseUrl,
    });

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: userPrompt });

    // Convert tools to OpenAI format
    const openaiTools: OpenAI.Chat.ChatCompletionTool[] | undefined = data.tools?.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));

    // Create tool name -> agent ID mapping for execution
    const toolAgentMap = new Map<string, string>();
    data.tools?.forEach((tool) => {
      toolAgentMap.set(tool.name, tool.agentId);
    });

    const maxIterations = data.maxToolCalls ?? 5;
    let totalUsage = { inputTokens: 0, outputTokens: 0 };
    const executedToolCalls: Array<{ name: string; result: unknown }> = [];

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      try {
        const completion = await client.chat.completions.create({
          model: data.model || 'gpt-4o-mini',
          messages,
          temperature: data.temperature ?? 0.7,
          max_tokens: data.maxTokens ?? 1000,
          tools: openaiTools,
        });

        totalUsage.inputTokens += completion.usage?.prompt_tokens ?? 0;
        totalUsage.outputTokens += completion.usage?.completion_tokens ?? 0;

        const choice = completion.choices[0];
        if (!choice) {
          throw new NodeExecutionError('OpenAI returned no choices', {});
        }
        const assistantMessage = choice.message;

        // If no tool calls, we're done - return the final response
        if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
          return {
            response: assistantMessage.content ?? '',
            usage: totalUsage,
            toolCalls: executedToolCalls.length > 0 ? executedToolCalls : undefined,
          };
        }

        // Add assistant message with tool calls to conversation
        messages.push(assistantMessage);

        // Execute each tool call
        for (const toolCall of assistantMessage.tool_calls) {
          const toolName = toolCall.function.name;
          const agentId = toolAgentMap.get(toolName);

          if (!agentId) {
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify({ error: `Unknown tool: ${toolName}` }),
            });
            continue;
          }

          // Parse tool arguments
          let toolArgs: Record<string, unknown>;
          try {
            toolArgs = JSON.parse(toolCall.function.arguments);
          } catch {
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify({ error: 'Invalid JSON in tool arguments' }),
            });
            continue;
          }

          // Execute the sub-agent
          try {
            const result = await this.executeSubAgent(agentId, toolArgs, options);
            executedToolCalls.push({ name: toolName, result });
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify(result),
            });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify({ error: errorMessage }),
            });
          }
        }
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

    throw new NodeExecutionError(
      `Exceeded maximum tool call iterations (${maxIterations})`,
      { toolCalls: executedToolCalls }
    );
  }

  private async executeSubAgent(
    agentId: string,
    input: Record<string, unknown>,
    options: ExecutionOptions
  ): Promise<unknown> {
    if (!options.agentRepo || !options.runRepo) {
      throw new Error('Tool calling requires agentRepo and runRepo in options');
    }

    if (!options.userId) {
      throw new Error('Tool calling requires userId in options');
    }

    // Check for circular call
    const callStack = options.callStack ?? new Set<string>();
    if (callStack.has(agentId)) {
      const chain = [...callStack, agentId].join(' → ');
      throw new Error(`Circular agent call detected: ${chain}`);
    }

    // Load the target agent
    const targetAgent = await options.agentRepo.findById(agentId);
    if (!targetAgent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    // Permission check - agent must belong to same user OR be a system agent
    if (targetAgent.userId !== options.userId && !targetAgent.isSystem) {
      throw new Error(`Access denied to agent: ${agentId}`);
    }

    // Create new call stack with this agent
    const newCallStack = new Set(callStack);
    newCallStack.add(agentId);

    // Execute the sub-agent
    const executor = new WorkflowExecutor(options.runRepo);
    const run = await executor.executeInternal(
      targetAgent,
      input,
      options.userId,
      {
        providers: options.providers,
        workflowInput: input,
        agentRepo: options.agentRepo,
        runRepo: options.runRepo,
        callStack: newCallStack,
        userId: options.userId,
      }
    );

    if (run.status === 'failed') {
      throw new Error(`Sub-agent failed: ${run.error}`);
    }

    return run.output;
  }

  private async callAnthropic(
    data: LLMNodeData,
    systemPrompt: string | undefined,
    userPrompt: string,
    options: ExecutionOptions
  ): Promise<{ response: string; usage: { inputTokens: number; outputTokens: number }; toolCalls?: Array<{ name: string; result: unknown }> }> {
    const apiKey = options.providers.anthropic?.apiKey;
    if (!apiKey) {
      throw new NodeExecutionError('Anthropic API key not configured', {});
    }

    const client = new Anthropic({
      apiKey,
      baseURL: options.providers.anthropic?.baseUrl,
    });

    // Convert tools to Anthropic format
    const anthropicTools: Anthropic.Tool[] | undefined = data.tools?.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters as Anthropic.Tool.InputSchema,
    }));

    // Create tool name -> agent ID mapping
    const toolAgentMap = new Map<string, string>();
    data.tools?.forEach((tool) => {
      toolAgentMap.set(tool.name, tool.agentId);
    });

    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userPrompt }];

    const maxIterations = data.maxToolCalls ?? 5;
    let totalUsage = { inputTokens: 0, outputTokens: 0 };
    const executedToolCalls: Array<{ name: string; result: unknown }> = [];

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      try {
        const response = await client.messages.create({
          model: data.model || 'claude-sonnet-4-20250514',
          max_tokens: data.maxTokens ?? 1000,
          system: systemPrompt,
          messages,
          tools: anthropicTools,
        });

        totalUsage.inputTokens += response.usage.input_tokens;
        totalUsage.outputTokens += response.usage.output_tokens;

        // Check if there are tool uses in the response
        const toolUses = response.content.filter(
          (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
        );

        // If no tool uses, extract text and return
        if (toolUses.length === 0) {
          const textBlock = response.content.find(
            (block): block is Anthropic.TextBlock => block.type === 'text'
          );
          return {
            response: textBlock?.text ?? '',
            usage: totalUsage,
            toolCalls: executedToolCalls.length > 0 ? executedToolCalls : undefined,
          };
        }

        // Add assistant message with tool uses
        messages.push({ role: 'assistant', content: response.content });

        // Execute tool calls and collect results
        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const toolUse of toolUses) {
          const agentId = toolAgentMap.get(toolUse.name);

          if (!agentId) {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify({ error: `Unknown tool: ${toolUse.name}` }),
            });
            continue;
          }

          try {
            const result = await this.executeSubAgent(agentId, toolUse.input as Record<string, unknown>, options);
            executedToolCalls.push({ name: toolUse.name, result });
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify(result),
            });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify({ error: errorMessage }),
            });
          }
        }

        // Add tool results as user message
        messages.push({ role: 'user', content: toolResults });
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

    throw new NodeExecutionError(
      `Exceeded maximum tool call iterations (${maxIterations})`,
      { toolCalls: executedToolCalls }
    );
  }

  private async callOllama(
    data: LLMNodeData,
    systemPrompt: string | undefined,
    userPrompt: string,
    options: ExecutionOptions
  ): Promise<{ response: string; usage: { inputTokens: number; outputTokens: number } }> {
    const baseUrl = options.providers.ollama?.baseUrl;
    if (!baseUrl) {
      throw new NodeExecutionError('Ollama base URL not configured', {});
    }

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
