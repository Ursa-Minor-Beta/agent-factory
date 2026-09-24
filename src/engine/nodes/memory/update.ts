import type { WorkflowNode } from '../../../domain/entities/Agent.js';
import type { ExecutionContext } from '../../context.js';
import { BaseNode, type NodeExecutionResult, type ExecutionOptions } from '../base.js';
import { NodeExecutionError } from '../../../utils/errors.js';
import { interpolateAll } from '../utils.js';
import * as memoryService from '../../../domain/services/memory.service.js';

interface MemoryUpdateNodeData {
  collection: string;
  id: string;
  data?: Record<string, unknown>; // Deprecated: for backward compatibility
  [key: string]: unknown; // User-defined schema fields at root level
}

/**
 * Memory Update node - Update an existing record
 */
export class MemoryUpdateNode extends BaseNode {
  readonly type = 'memory-update';

  async execute(
    node: WorkflowNode,
    context: ExecutionContext,
    options: ExecutionOptions
  ): Promise<NodeExecutionResult> {
    const data = node.data as unknown as MemoryUpdateNodeData;
    const secrets = options.resolvedSecrets ?? {};
    const interpolateOpts = { secrets, context };

    if (!data.collection) {
      throw new NodeExecutionError('memory-update requires "collection" field', {});
    }
    if (!data.id) {
      throw new NodeExecutionError('memory-update requires "id" field', {});
    }

    if (!options.memorySchemaRepo || !options.memoryStoreRepo) {
      throw new NodeExecutionError('Memory repositories not available', {});
    }

    const userId = options.userId;
    if (!userId) {
      throw new NodeExecutionError('memory-update requires authenticated user', {});
    }

    const recordId = interpolateAll(data.id, interpolateOpts);

    // Extract user data - support both old format (wrapped) and new format (flat)
    const { collection, id, data: wrappedData, ...directFields } = data;
    const userData = wrappedData ?? directFields; // Use wrappedData if present (backward compat), else use direct fields

    if (Object.keys(userData).length === 0) {
      throw new NodeExecutionError('memory-update requires data fields to update', {});
    }

    const interpolatedData = this.interpolateObject(userData, interpolateOpts);

    const updated = await memoryService.updateMemoryRecord(
      userId,
      data.collection,
      recordId,
      interpolatedData,
      {
        memorySchemaRepo: options.memorySchemaRepo,
        memoryStoreRepo: options.memoryStoreRepo,
      }
    );

    const outputs = {
      success: true,
      record: updated,
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
