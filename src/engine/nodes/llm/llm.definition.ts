import { config } from '../../../config/index.js';
import type { NodeDefinitionRaw } from '../definition.types.js';
import {
  DEFAULT_MAX_TOOL_CALLS,
  DEFAULT_TOOL_EXECUTION_MODE,
  DEFAULT_TEMPERATURE,
  DEFAULT_MAX_TOKENS,
  DEFAULT_MAX_MESSAGES,
} from './constants.js';

export const LLM_NODE_DEFINITION: NodeDefinitionRaw = {
  type: 'llm',
  description: 'LLM call node. Sends prompts to OpenAI, Anthropic, or Ollama.',
  statusText: 'Thinking...',
  inputs: ['prompt', 'context'],
  outputs: ['response', 'usage', 'toolCalls'],
  options: [
    {
      name: 'provider',
      type: 'enum',
      required: true,
      description: 'LLM provider to use.',
      values: ['openai', 'anthropic', 'ollama'],
    },
    {
      name: 'model',
      type: 'string',
      required: true,
      description: 'Model name (e.g., gpt-4o-mini, claude-sonnet-4-20250514, llama3.2).',
    },
    {
      name: 'systemPrompt',
      type: 'text',
      description: 'System prompt. Supports {{node:id.path}} template syntax.',
    },
    {
      name: 'userPrompt',
      type: 'text',
      description: 'User prompt. Supports {{node:id.path}} template syntax.',
    },
    {
      name: 'temperature',
      type: 'number',
      description: 'Sampling temperature (0-2).',
      default: DEFAULT_TEMPERATURE,
    },
    {
      name: 'maxTokens',
      type: 'number',
      description: 'Maximum tokens in response.',
      default: DEFAULT_MAX_TOKENS,
    },
    {
      name: 'maxMessages',
      type: 'number',
      description: 'Maximum conversation history messages to include.',
      default: DEFAULT_MAX_MESSAGES,
    },
    {
      name: 'tools',
      type: 'object',
      description: 'Array of tool definitions for function calling.',
    },
    {
      name: 'maxToolCalls',
      type: 'number',
      description: `Maximum tool call iterations before stopping${config.llm.maxToolCalls ? ` (server limit: ${config.llm.maxToolCalls})` : ''}.`,
      default: Math.min(DEFAULT_MAX_TOOL_CALLS, config.llm.maxToolCalls || DEFAULT_MAX_TOOL_CALLS)
    },
    {
      name: 'toolExecutionMode',
      type: 'enum',
      description: 'How to execute multiple tool calls: parallel (all at once) or sequential (one by one).',
      values: ['parallel', 'sequential'],
      default: DEFAULT_TOOL_EXECUTION_MODE,
    },
  ],
  features: [
    'Template interpolation with {{node:id.path}} syntax',
  ],
  examples: [
    {
      name: 'Simple chat',
      description: 'Basic OpenAI chat completion',
      id: 'llm-1',
      type: 'llm',
      data: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        systemPrompt: 'You are a helpful assistant.',
        userPrompt: '{{node:input.text}}',
        temperature: 0.7,
        maxTokens: 1000,
      },
    },
    {
      name: 'With builtin tools',
      description: 'LLM with memory search tool. Builtin tools receive parameters from LLM function calling.',
      id: 'llm-2',
      type: 'llm',
      data: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        systemPrompt: 'You are a helpful assistant. Use the memory_search tool to find relevant information. The tool accepts: collection (string), filters (object, optional), limit (number, optional).',
        userPrompt: '{{node:input.text}}',
        tools: [
          {
            type: 'builtin',
            name: 'memory_search',
          },
        ],
        maxToolCalls: 5,
      },
    },
    {
      name: 'With agent tool',
      description: 'LLM that can call another agent as a tool. The agent runs and returns its output.',
      id: 'llm-3',
      type: 'llm',
      data: {
        provider: 'openai',
        model: 'gpt-4o',
        systemPrompt: 'You are an assistant that can delegate tasks to specialized agents.',
        userPrompt: '{{node:input.text}}',
        tools: [
          {
            type: 'agent',
            agentId: '<agent-id>',
            name: 'text_summarizer',
            description: 'Summarizes long text into key points',
            parameters: {
              type: 'object',
              properties: {
                text: { type: 'string', description: 'The text to summarize' },
              },
              required: ['text'],
            },
          },
        ],
        maxToolCalls: 3,
      },
    },
  ],
};
