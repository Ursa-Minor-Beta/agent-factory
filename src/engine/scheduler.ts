import type { WorkflowNode } from '../domain/entities/Agent.js';
import { buildAdjacencyList } from './graph.js';
import { config } from '../config/index.js';

export interface ScheduleOptions {
  /** Checked before starting nodes and after each node finishes */
  shouldStop?: () => boolean;
  maxParallel?: number;
}

export type ScheduleResult =
  | { status: 'completed' }
  | { status: 'failed'; error: string }
  | { status: 'cancelled' };

/**
 * Run nodes concurrently as soon as all their dependencies are finished.
 * Dependencies are template refs + branch edges. Output nodes wait for every other node.
 * After the first failure (or a stop request) no new nodes are started;
 * in-flight nodes finish and the first error (or cancellation) is returned.
 *
 * @param runNode executes a node, resolves to an error message on failure or null on success/skip
 */
export async function runNodesConcurrently(
  nodes: WorkflowNode[],
  executionOrder: string[],
  runNode: (nodeId: string) => Promise<string | null>,
  options: ScheduleOptions = {}
): Promise<ScheduleResult> {
  const maxParallel = Math.max(1, options.maxParallel ?? config.engine.defaultParallelNodes);
  const shouldStop = options.shouldStop ?? (() => false);
  const outputNodeIds = new Set(nodes.filter((n) => n.type === 'output').map((n) => n.id));

  // nodeId -> ids it depends on
  const dependencies = new Map<string, Set<string>>(executionOrder.map((id) => [id, new Set()]));
  for (const [sourceId, targets] of buildAdjacencyList(nodes)) {
    for (const targetId of targets) {
      dependencies.get(targetId)?.add(sourceId);
    }
  }

  const pending = [...executionOrder];
  const finished = new Set<string>();
  const running = new Map<string, Promise<{ nodeId: string; error: string | null }>>();
  let firstError: string | null = null;
  let cancelled = false;

  const isReady = (nodeId: string): boolean => {
    if (outputNodeIds.has(nodeId)) {
      return executionOrder.every((id) => outputNodeIds.has(id) || finished.has(id));
    }
    return [...dependencies.get(nodeId)!].every((dep) => finished.has(dep));
  };

  while (pending.length > 0 || running.size > 0) {
    if (!cancelled && shouldStop()) {
      cancelled = true;
    }

    if (firstError === null && !cancelled) {
      for (let i = 0; i < pending.length && running.size < maxParallel; ) {
        const nodeId = pending[i]!;
        if (!isReady(nodeId)) {
          i++;
          continue;
        }
        pending.splice(i, 1);
        running.set(nodeId, runNode(nodeId).then(
          (error) => ({ nodeId, error }),
          (err: unknown) => ({ nodeId, error: err instanceof Error ? err.message : String(err) })
        ));
      }
    }

    if (running.size === 0) break;

    const { nodeId, error } = await Promise.race(running.values());
    running.delete(nodeId);
    finished.add(nodeId);
    if (error !== null && firstError === null) {
      firstError = error;
    }
  }

  if (firstError !== null) return { status: 'failed', error: firstError };
  if (cancelled || shouldStop()) return { status: 'cancelled' };
  return { status: 'completed' };
}
