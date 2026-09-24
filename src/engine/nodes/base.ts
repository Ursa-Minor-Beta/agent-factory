import type { WorkflowNode } from '../../domain/entities/Agent.js';
import type { ExecutionContext } from '../context.js';
import type { IAgentRepository } from '../../domain/interfaces/repositories/IAgentRepository.js';
import type { IRunRepository } from '../../domain/interfaces/repositories/IRunRepository.js';
import type { IMessageRepository } from '../../domain/interfaces/repositories/IMessageRepository.js';
import type { IFileRepository } from '../../domain/interfaces/repositories/IFileRepository.js';
import type { IMemorySchemaRepository } from '../../domain/interfaces/repositories/IMemorySchemaRepository.js';
import type { IMemoryStoreRepository } from '../../domain/interfaces/repositories/IMemoryStoreRepository.js';

export interface NodeExecutionResult {
  outputs: Record<string, unknown>;
  state?: unknown;
  files?: string[]; // File references in format "{{inner:id}}"
}

export interface ProviderConfig {
  openai?: { apiKey: string; baseUrl?: string };
  anthropic?: { apiKey: string; baseUrl?: string };
  ollama?: { baseUrl: string };
}

// Chat message format for session context
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ExecutionOptions {
  providers: ProviderConfig;
  workflowInput: Record<string, unknown>;
  // For agent node - sub-agent execution
  agentRepo?: IAgentRepository;
  runRepo?: IRunRepository;
  callStack?: Set<string>; // Track agent IDs to detect circular calls
  userId?: string; // Current user for permission checks
  currentRunId?: string; // Current run ID for parent-child linking
  // For LLM multi-turn conversations
  sessionId?: string;
  messageRepo?: IMessageRepository;
  // Pre-resolved secrets for {{secret:KEY}} interpolation in HTTP nodes
  resolvedSecrets?: Record<string, string>;
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
}

export abstract class BaseNode {
  abstract readonly type: string;

  abstract execute(
    node: WorkflowNode,
    context: ExecutionContext,
    options: ExecutionOptions
  ): Promise<NodeExecutionResult>;
}
