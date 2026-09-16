import type { Agent } from '../../domain/entities/Agent.js';
import type { NodeState } from '../../domain/entities/Run.js';
import type { ProviderConfig } from '../nodes/index.js';

/**
 * Chat message for session context
 */
export interface ChatMessageContext {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Session context for chat-based execution
 */
export interface SessionContext {
  sessionId: string;
  messages?: ChatMessageContext[];
  /** LLM-managed notes/scratchpad - persists important context */
  notes?: string;
  /** Max length for session notes (default: 8000) */
  maxNotesLength?: number;
}

/**
 * Configuration passed to worker for execution
 */
export interface WorkerExecutionConfig {
  runId: string;
  agent: Agent;
  input: Record<string, unknown>;
  userId: string;
  providers: ProviderConfig;
  mongoUri: string;
  resolvedSecrets?: Record<string, string>;
  /** Session context for chat-based execution */
  sessionContext?: SessionContext;
}

/**
 * Messages sent from parent process to worker
 */
export type ParentMessage =
  | { type: 'start'; config: WorkerExecutionConfig }
  | { type: 'cancel' }; // Request graceful shutdown

/**
 * Messages sent from worker to parent process
 */
export type WorkerMessage =
  | { type: 'started' }
  | { type: 'node-started'; nodeId: string; nodeType: string }
  | { type: 'node-completed'; nodeId: string; nodeType: string; state: Partial<NodeState> }
  | { type: 'node-failed'; nodeId: string; nodeType: string; error: string }
  | { type: 'node-skipped'; nodeId: string; nodeType: string }
  | { type: 'completed'; output: Record<string, unknown>; files?: string[] }
  | { type: 'failed'; error: string }
  | { type: 'cancelled' };

/**
 * Type guard for ParentMessage
 */
export function isParentMessage(msg: unknown): msg is ParentMessage {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;
  return m.type === 'start' || m.type === 'cancel';
}

/**
 * Type guard for WorkerMessage
 */
export function isWorkerMessage(msg: unknown): msg is WorkerMessage {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;
  return (
    m.type === 'started' ||
    m.type === 'node-started' ||
    m.type === 'node-completed' ||
    m.type === 'node-failed' ||
    m.type === 'node-skipped' ||
    m.type === 'completed' ||
    m.type === 'failed' ||
    m.type === 'cancelled'
  );
}
