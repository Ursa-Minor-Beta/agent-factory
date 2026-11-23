import type { Agent } from '../domain/entities/Agent.js';
import type { Run, CreateRunDTO, RunStatus, NodeState } from '../domain/entities/Run.js';
import type {
  IRunRepository,
  RunQueryOptions,
  RunQueryResult,
  RunSummaryQueryResult,
  RunWithChildrenQueryOptions,
} from '../domain/interfaces/repositories/IRunRepository.js';
import type { LLMProvider, RunUsage, TokenUsage } from './nodes/llm/types.js';

const REDACTED_ERROR = 'error';

/**
 * Run repository decorator for agents with `settings.minimalRunLogging`.
 * Persists only statuses/timestamps/usage: no input, output, node state, files or error details.
 * Errors are stored as 'error'. Executors pass it down as `runRepo`, so child runs inherit it.
 */
export class MinimalRunRepository implements IRunRepository {
  constructor(private inner: IRunRepository) {}

  create(data: CreateRunDTO): Promise<Run> {
    return this.inner.create({ ...data, input: {} });
  }

  updateStatus(id: string, status: RunStatus, error?: string | null): Promise<Run | null> {
    return this.inner.updateStatus(id, status, error ? REDACTED_ERROR : error);
  }

  updateNodeState(id: string, nodeId: string, state: Partial<NodeState>): Promise<Run | null> {
    const minimal: Partial<NodeState> = {};
    if (state.nodeType !== undefined) minimal.nodeType = state.nodeType;
    if (state.status !== undefined) minimal.status = state.status;
    if (state.startedAt !== undefined) minimal.startedAt = state.startedAt;
    if (state.completedAt !== undefined) minimal.completedAt = state.completedAt;
    if (state.error !== undefined) minimal.error = state.error ? REDACTED_ERROR : null;
    return this.inner.updateNodeState(id, nodeId, minimal);
  }

  setOutput(id: string): Promise<Run | null> {
    return this.inner.setOutput(id, {});
  }

  complete(id: string): Promise<Run | null> {
    return this.inner.complete(id, {});
  }

  fail(id: string): Promise<Run | null> {
    return this.inner.fail(id, REDACTED_ERROR);
  }

  findById(id: string): Promise<Run | null> {
    return this.inner.findById(id);
  }

  findByIdWithChildren(id: string): Promise<Run | null> {
    return this.inner.findByIdWithChildren(id);
  }

  findByAgentId(agentId: string, limit?: number): Promise<Run[]> {
    return this.inner.findByAgentId(agentId, limit);
  }

  findByUserId(userId: string, limit?: number): Promise<Run[]> {
    return this.inner.findByUserId(userId, limit);
  }

  findAll(options?: RunQueryOptions): Promise<RunQueryResult> {
    return this.inner.findAll(options);
  }

  cancel(id: string): Promise<Run | null> {
    return this.inner.cancel(id);
  }

  findParentsWithChildren(options?: RunWithChildrenQueryOptions): Promise<RunQueryResult> {
    return this.inner.findParentsWithChildren(options);
  }

  findAllSummary(options?: RunQueryOptions): Promise<RunSummaryQueryResult> {
    return this.inner.findAllSummary(options);
  }

  findParentsWithChildIdsSummary(options?: RunWithChildrenQueryOptions): Promise<RunSummaryQueryResult> {
    return this.inner.findParentsWithChildIdsSummary(options);
  }

  addUsage(id: string, provider: LLMProvider, usage: TokenUsage): Promise<Run | null> {
    return this.inner.addUsage(id, provider, usage);
  }

  rollUpChildRun(parentId: string, childRunIds: string[], usage?: RunUsage): Promise<void> {
    return this.inner.rollUpChildRun(parentId, childRunIds, usage);
  }

  deleteBy(options: { id?: string | string[]; agentId?: string | string[]; userId?: string }): Promise<number> {
    return this.inner.deleteBy(options);
  }

  cancelChildRuns(parentRunId: string, error?: string): Promise<string[]> {
    return this.inner.cancelChildRuns(parentRunId, error);
  }
}

/** Wrap the repository when the agent opts into minimal run logging (no-op if already wrapped) */
export function runRepoForAgent(agent: Pick<Agent, 'settings'>, runRepo: IRunRepository): IRunRepository {
  if (runRepo instanceof MinimalRunRepository || !agent.settings?.minimalRunLogging) {
    return runRepo;
  }
  return new MinimalRunRepository(runRepo);
}
