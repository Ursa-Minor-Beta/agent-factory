import type { WorkflowNode } from '../../domain/entities/Agent.js';
import type { ExecutionContext } from '../context.js';
import type { IAgentRepository } from '../../domain/interfaces/repositories/IAgentRepository.js';
import type { IRunRepository } from '../../domain/interfaces/repositories/IRunRepository.js';

export interface NodeExecutionResult {
  outputs: Record<string, unknown>;
}

export interface ProviderConfig {
  openai?: { apiKey: string };
  anthropic?: { apiKey: string };
  ollama?: { baseUrl: string };
}

export interface ExecutionOptions {
  providers: ProviderConfig;
  workflowInput: Record<string, unknown>;
  // For agent node - sub-agent execution
  agentRepo?: IAgentRepository;
  runRepo?: IRunRepository;
  callStack?: Set<string>; // Track agent IDs to detect circular calls
  userId?: string; // Current user for permission checks
}

export abstract class BaseNode {
  abstract readonly type: string;

  abstract execute(
    node: WorkflowNode,
    context: ExecutionContext,
    options: ExecutionOptions
  ): Promise<NodeExecutionResult>;
}
