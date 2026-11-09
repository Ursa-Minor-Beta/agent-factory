import type { WorkflowNode } from '../../domain/entities/Agent.js';
import type { LlmProtocol } from '../../domain/entities/ProviderConfig.js';
import type { ExecutionContext } from '../context.js';
import type { IAgentRepository } from '../../domain/interfaces/repositories/IAgentRepository.js';
import type { IRunRepository } from '../../domain/interfaces/repositories/IRunRepository.js';
import type { IMessageRepository } from '../../domain/interfaces/repositories/IMessageRepository.js';
import type { IFileRepository } from '../../domain/interfaces/repositories/IFileRepository.js';
import type { IMemorySchemaRepository } from '../../domain/interfaces/repositories/IMemorySchemaRepository.js';
import type { IMemoryStoreRepository } from '../../domain/interfaces/repositories/IMemoryStoreRepository.js';
import type { ClientToolDefinition } from '../tools/types.js';

export interface NodeExecutionResult {
  outputs: Record<string, unknown>;
  state?: unknown;
  files?: string[]; // File references in format "{{inner:id}}"
}

export interface ResolvedProvider {
  protocol: LlmProtocol;
  apiKey?: string;
  baseUrl?: string;
  // `configId`/`name` identify the stored provider config (for run tracking)
  configId?: string;
  name?: string;
}

/** Resolved LLM providers keyed by provider type (e.g. "openai", "deepseek") */
export type ProviderConfig = Partial<Record<string, ResolvedProvider>>;

// Chat message format for session context
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Node lifecycle event emitted from a sub-agent run (agent node / agent tool) */
export interface SubAgentNodeEvent {
  runId: string; // Sub-agent run ID
  parentRunId?: string;
  agentId: string;
  agentName: string;
  nodeId: string;
  path: string[]; // [callerNodeId, agentName, ..., nodeId] from the top-level agent
  nodeType: string;
  status: 'started' | 'completed' | 'failed' | 'skipped';
  error?: string;
}

/** Tool call that must be executed by the client (UI) */
export interface ClientToolCall {
  toolCallId: string;
  name: string;
  args: Record<string, unknown>;
}

/** Lifecycle event of a server-executed LLM tool call (builtin / agent) */
export interface ToolCallEvent {
  toolCallId: string;
  name: string;
  toolType: 'builtin' | 'agent';
  nodeId: string;
  path: string[]; // [...subAgentPath, nodeId] - empty subAgentPath for the top-level agent
  status: 'started' | 'completed' | 'failed';
  error?: string; // Only on 'failed'
  durationMs?: number; // Only on 'completed' / 'failed'
}

export interface ResolvedScope {
  secrets: Record<string, string>;
  variables: Record<string, string>;
}

export interface ExecutionOptions {
  providers: ProviderConfig;
  workflowInput: Record<string, unknown>;
  // For agent node - sub-agent execution
  agentRepo?: IAgentRepository;
  runRepo?: IRunRepository;
  callStack?: Set<string>; // Track agent IDs to detect circular calls
  userId?: string; // Current user for permission checks
  workspaceId?: string; // Current workspace for scoped resources (memory, secrets, etc.)
  currentRunId?: string; // Current run ID for parent-child linking
  // For LLM multi-turn conversations
  sessionId?: string;
  messageRepo?: IMessageRepository;
  // Pre-resolved secrets for {{secret:KEY}} interpolation in HTTP nodes
  resolvedSecrets?: Record<string, string>;
  // Pre-resolved user variables for {{var:KEY}} substitution in any node input
  resolvedVariables?: Record<string, string>;
  // Workspace that resolvedSecrets/resolvedVariables were built for (undefined = global)
  scopeWorkspaceId?: string;
  // Rebuilds secrets/variables for a sub-agent whose workspace differs from the caller's
  resolveScope?: (userId: string, workspaceId?: string) => Promise<ResolvedScope>;
  // Session context (separate from user input)
  messages?: ChatMessage[]; // For incognito sessions - conversation history
  // Session notes (scratchpad) - persists important context across conversation
  sessionNotes?: string;
  onSessionNotesUpdate?: (notes: string) => Promise<void>; // Callback to persist notes
  maxNotesLength?: number; // Max length for session notes (default: 8000)
  // SSE: Output paths that downstream nodes need (for early termination)
  requiredOutputPaths?: string[];
  // File storage - for output node to save files when referenced
  fileRepo?: IFileRepository;
  // Memory storage - for memory node operations
  memorySchemaRepo?: IMemorySchemaRepository;
  memoryStoreRepo?: IMemoryStoreRepository;
  // Forwards node events of nested sub-agent runs up to the top-level run
  onSubAgentNodeEvent?: (event: SubAgentNodeEvent) => void;
  subAgentPath?: string[]; // Path to the current sub-agent: [callerNodeId, agentName, ...]
  // Forwards server tool call events (top-level and nested sub-agents) up to the top-level run
  onToolCallEvent?: (event: ToolCallEvent) => void;
  // Client tools - top-level run only, never passed to sub-agents
  clientTools?: ClientToolDefinition[];
  requestClientTool?: (call: ClientToolCall) => Promise<unknown>; // Resolves with the client's result
}

export abstract class BaseNode {
  abstract readonly type: string;

  abstract execute(
    node: WorkflowNode,
    context: ExecutionContext,
    options: ExecutionOptions
  ): Promise<NodeExecutionResult>;
}
