import type { WorkflowNode } from '../../../domain/entities/Agent.js';
import type { ExecutionContext } from '../../context.js';
import { BaseNode, type NodeExecutionResult, type ExecutionOptions } from '../base.js';
import { NodeExecutionError } from '../../../utils/errors.js';
import { interpolateAll } from '../utils.js';
import * as memoryService from '../../../domain/services/memory.service.js';

interface MemoryStoreNodeData {
  collection: string;
  data?: Record<string, unknown>; // Deprecated: for backward compatibility
  [key: string]: unknown; // User-defined schema fields at root level
}

/**
 * Memory Store node - Save data to a memory collection
 * Schema fields can be passed directly in node.data or wrapped in data object (deprecated)
 */
export class MemoryStoreNode extends BaseNode {
  readonly type = 'memory-store';

  async execute(
    node: WorkflowNode,
    context: ExecutionContext,
    options: ExecutionOptions
  ): Promise<NodeExecutionResult> {
    const nodeData = node.data as unknown as MemoryStoreNodeData;
    const secrets = options.resolvedSecrets ?? {};
    const interpolateOpts = { secrets, context };

    if (!nodeData.collection) {
      throw new NodeExecutionError('memory-store requires "collection" field', {});
    }

    if (!options.memorySchemaRepo || !options.memoryStoreRepo) {
      throw new NodeExecutionError('Memory repositories not available', {});
    }

    const userId = options.userId;
    if (!userId) {
      throw new NodeExecutionError('memory-store requires authenticated user', {});
    }

    // Extract user data - support both old format (wrapped) and new format (flat)
    const { collection, data, ...directFields } = nodeData;
    const userData = data ?? directFields; // Use data if present (backward compat), else use direct fields

    if (Object.keys(userData).length === 0) {
      throw new NodeExecutionError('memory-store requires data fields', {});
    }

    const interpolatedData = this.interpolateObject(userData, interpolateOpts);

    const record = await memoryService.saveMemoryRecord(
      userId,
      nodeData.collection,
      interpolatedData,
      {
        memorySchemaRepo: options.memorySchemaRepo,
        memoryStoreRepo: options.memoryStoreRepo,
      }
    );

    const outputs = {
      success: true,
      id: record.id,
      record,
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
