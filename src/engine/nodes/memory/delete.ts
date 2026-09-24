import type { WorkflowNode } from '../../../domain/entities/Agent.js';
import type { ExecutionContext } from '../../context.js';
import { BaseNode, type NodeExecutionResult, type ExecutionOptions } from '../base.js';
import { NodeExecutionError } from '../../../utils/errors.js';
import { interpolateAll } from '../utils.js';
import * as memoryService from '../../../domain/services/memory.service.js';

interface MemoryDeleteNodeData {
  collection: string;
  id: string;
}

/**
 * Memory Delete node - Delete a record from memory
 */
export class MemoryDeleteNode extends BaseNode {
  readonly type = 'memory-delete';

  async execute(
    node: WorkflowNode,
    context: ExecutionContext,
    options: ExecutionOptions
  ): Promise<NodeExecutionResult> {
    const data = node.data as unknown as MemoryDeleteNodeData;
    const secrets = options.resolvedSecrets ?? {};
    const interpolateOpts = { secrets, context };

    if (!data.collection) {
      throw new NodeExecutionError('memory-delete requires "collection" field', {});
    }
    if (!data.id) {
      throw new NodeExecutionError('memory-delete requires "id" field', {});
    }

    if (!options.memorySchemaRepo || !options.memoryStoreRepo) {
      throw new NodeExecutionError('Memory repositories not available', {});
    }

    const userId = options.userId;
    if (!userId) {
      throw new NodeExecutionError('memory-delete requires authenticated user', {});
    }

    const recordId = interpolateAll(data.id, interpolateOpts);

    await memoryService.deleteMemoryRecord(
      userId,
      data.collection,
      recordId,
      {
        memorySchemaRepo: options.memorySchemaRepo,
        memoryStoreRepo: options.memoryStoreRepo,
      }
    );

    const outputs = {
      success: true,
      deleted: true,
    };

    for (const [key, value] of Object.entries(outputs)) {
      context.setOutput(node.id, key, value);
    }

    return { outputs };
  }
}
