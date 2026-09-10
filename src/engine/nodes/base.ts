import type { WorkflowNode } from '../../domain/entities/Agent.js';
import type { ExecutionContext } from '../context.js';
import type { IAgentRepository } from '../../domain/interfaces/repositories/IAgentRepository.js';
import type { IRunRepository } from '../../domain/interfaces/repositories/IRunRepository.js';

export interface NodeExecutionResult {
  outputs: Record<string, unknown>;
}

export interface ProviderConfig {
  openai?: { apiKey: string; baseUrl?: string };
  anthropic?: { apiKey: string; baseUrl?: string };
  ollama?: { baseUrl: string };
}

// Callback for built-in tools to save agent notes
export type SaveNotesCallback = (notes: string) => Promise<void>;

export interface ExecutionOptions {
  providers: ProviderConfig;
  workflowInput: Record<string, unknown>;
  // For agent node - sub-agent execution
  agentRepo?: IAgentRepository;
  runRepo?: IRunRepository;
  callStack?: Set<string>; // Track agent IDs to detect circular calls
  userId?: string; // Current user for permission checks
  // For built-in tools (save_note)
  sessionId?: string;
  saveNotes?: SaveNotesCallback;
  // Pre-resolved secrets for {{secret:KEY}} interpolation in HTTP nodes
  resolvedSecrets?: Record<string, string>;
}

export abstract class BaseNode {
  abstract readonly type: string;

  abstract execute(
    node: WorkflowNode,
    context: ExecutionContext,
    options: ExecutionOptions
  ): Promise<NodeExecutionResult>;
}
