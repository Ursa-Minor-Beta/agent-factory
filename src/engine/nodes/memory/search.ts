import type { WorkflowNode } from '../../../domain/entities/Agent.js';
import type { ExecutionContext } from '../../context.js';
import { BaseNode, type NodeExecutionResult, type ExecutionOptions } from '../base.js';
import { NodeExecutionError } from '../../../utils/errors.js';
import { interpolateAll } from '../utils.js';
import * as memoryService from '../../../domain/services/memory.service.js';

interface MemorySearchNodeData {
  collection: string;
  filters?: Record<string, unknown>;
  sort?: { field: string; direction: 'asc' | 'desc' };
  limit?: number;
  offset?: number;
}

/**
 * Memory Search node - Search records in a memory collection
 */
export class MemorySearchNode extends BaseNode {
  readonly type = 'memory-search';

  async execute(
    node: WorkflowNode,
    context: ExecutionContext,
    options: ExecutionOptions
  ): Promise<NodeExecutionResult> {
    const data = node.data as unknown as MemorySearchNodeData;
    const secrets = options.resolvedSecrets ?? {};
    const interpolateOpts = { secrets, context };

    if (!data.collection) {
      throw new NodeExecutionError('memory-search requires "collection" field', {});
    }

    if (!options.memorySchemaRepo || !options.memoryStoreRepo) {
      throw new NodeExecutionError('Memory repositories not available', {});
    }

    const userId = options.userId;
    if (!userId) {
      throw new NodeExecutionError('memory-search requires authenticated user', {});
    }

    const interpolatedFilters = data.filters
      ? this.interpolateObject(data.filters, interpolateOpts)
      : undefined;

    const records = await memoryService.searchMemoryRecords(
      userId,
      data.collection,
      {
        filters: interpolatedFilters,
        sort: data.sort,
        limit: data.limit ?? 10,
        offset: data.offset ?? 0,
      },
      {
        memorySchemaRepo: options.memorySchemaRepo,
        memoryStoreRepo: options.memoryStoreRepo,
      }
    );

    const outputs = {
      records,
      count: records.length,
    };

    for (const [key, value] of Object.entries(outputs)) {
      context.setOutput(node.id, key, value);
    }

    return { outputs };
  }

  private interpolateObject(
    obj: Record<string, unknown>,
    opts: { secrets: Record<string, string>; context: ExecutionContext }
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        result[key] = interpolateAll(value, opts);
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        result[key] = this.interpolateObject(value as Record<string, unknown>, opts);
      } else {
        result[key] = value;
      }
    }
    return result;
  }
}
