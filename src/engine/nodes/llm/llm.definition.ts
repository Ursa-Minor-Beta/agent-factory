import { config } from '../../../config/index.js';
import type { NodeDefinitionRaw } from '../definition.types.js';
import { LLM_PROVIDER_TYPES } from '../../../domain/entities/ProviderConfig.js';
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
      description: 'LLM provider to use (must be configured in provider settings).',
      values: [...LLM_PROVIDER_TYPES],
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
      name: 'extraParams',
      type: 'object',
      description: 'Provider-specific request fields, deep-merged into the API request (e.g. {"reasoning": {"effort": "high"}} for OpenAI, {"thinking": {"type": "enabled", "budget_tokens": 2048}} for Anthropic). null removes a field (e.g. {"temperature": null}). String values support templates.',
    },
    {
      name: 'mcpServers',
      type: 'object',
      description: [
        'Remote MCP servers whose tools the model can use. The provider (Anthropic MCP connector / OpenAI Responses mcp tool) connects to the servers itself, so only anthropic and openai providers are supported and the URL must be publicly reachable (no localhost or stdio servers).',
        'Format: an array of servers (a single server object is also accepted).',
        'Fields: name (required, unique label; tools appear in toolCalls output as mcp__<name>__<tool>); url (required, Streamable HTTP or SSE endpoint); authorizationToken (optional, sent as Bearer token); headers (optional extra request headers, openai only); allowedTools (optional array of tool names, all server tools when omitted).',
        'name, url, authorizationToken and header values support templates, e.g. "authorizationToken": "{{secret:GITHUB_TOKEN}}".',
        'Can be combined with builtin tools in the same node. MCP calls run on the provider side without approval and do not count toward maxToolCalls.',
        'Example: [{"name": "deepwiki", "url": "https://mcp.deepwiki.com/mcp"}, {"name": "github", "url": "https://api.githubcopilot.com/mcp/", "authorizationToken": "{{secret:GITHUB_TOKEN}}", "allowedTools": ["search_issues"]}]',
      ].join(' '),
    },
    {
      name: 'maxMessages',
      type: 'number',
      description: 'Maximum conversation history messages to include.',
      default: DEFAULT_MAX_MESSAGES,
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
    {
      name: 'Reasoning model with extraParams',
      description: 'Provider-specific fields merged into the request. Here: OpenAI reasoning effort, temperature removed (reasoning models reject it).',
      id: 'llm-4',
      type: 'llm',
      data: {
        provider: 'openai',
        model: 'gpt-5-mini',
        userPrompt: '{{node:input.text}}',
        extraParams: {
          reasoning: { effort: 'high' },
          temperature: null,
        },
      },
    },
    {
      name: 'Anthropic extended thinking',
      description: 'Anthropic thinking via extraParams. maxTokens must exceed budget_tokens.',
      id: 'llm-5',
      type: 'llm',
      data: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        userPrompt: '{{node:input.text}}',
        maxTokens: 8000,
        extraParams: {
          thinking: { type: 'enabled', budget_tokens: 4000 },
          temperature: null,
        },
      },
    },
    {
      name: 'With remote MCP servers',
      description: 'Provider calls remote MCP servers directly (anthropic/openai). MCP calls appear in toolCalls as mcp__<server>__<tool>.',
      id: 'llm-6',
      type: 'llm',
      data: {
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        systemPrompt: 'Answer questions about GitHub repositories using the available tools.',
        userPrompt: '{{node:input.text}}',
        mcpServers: [
          {
            name: 'deepwiki',
            url: 'https://mcp.deepwiki.com/mcp',
          },
          {
            name: 'github',
            url: 'https://api.githubcopilot.com/mcp/',
            authorizationToken: '{{secret:GITHUB_TOKEN}}',
            allowedTools: ['search_issues', 'get_issue'],
          },
        ],
      },
    },
  ],
};
