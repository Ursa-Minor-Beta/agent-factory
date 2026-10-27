import type { WorkflowNode } from '../../domain/entities/Agent.js';
import type { ExecutionContext } from '../context.js';
import { BaseNode, type NodeExecutionResult, type ExecutionOptions } from './base.js';
import { WorkflowExecutor } from '../executor.js';
import { resolveRunOutput } from '../../utils/node-ref.js';
import { interpolateDeep } from './interpolate.js';
import { extractAndStoreFiles } from './file-helper.js';

interface AgentNodeData {
  agentId: string;
  // Field templates, e.g., { query: "{{node:http-1.response}}" },
  // or an array / template resolving to an array to run once per item
  inputs?: Record<string, unknown> | unknown[] | string;
}

interface InputFieldDef {
  type?: string;
  required?: boolean;
  default?: unknown;
}

/**
 * Agent node - Execute another agent as a sub-workflow
 *
 * Data config:
 *   - agentId: ID of the agent to execute
 *   - inputs: Values for the target agent's input schema fields, e.g., { query: "{{node:http-1.response}}" }
 */
export class AgentNode extends BaseNode {
  readonly type = 'agent';

  async execute(
    node: WorkflowNode,
    context: ExecutionContext,
    options: ExecutionOptions
  ): Promise<NodeExecutionResult> {
    const data = node.data as unknown as AgentNodeData;

    if (!data.agentId) {
      throw new Error('Agent node requires agentId in data');
    }

    if (!options.agentRepo || !options.runRepo) {
      throw new Error('Agent node requires agentRepo and runRepo in options');
    }

    if (!options.userId) {
      throw new Error('Agent node requires userId in options');
    }

    // Check for circular call
    const callStack = options.callStack ?? new Set<string>();
    if (callStack.has(data.agentId)) {
      const chain = [...callStack, data.agentId].join(' → ');
      throw new Error(`Circular agent call detected: ${chain}`);
    }

    // Load the target agent
    const targetAgent = await options.agentRepo.findById(data.agentId);
    if (!targetAgent) {
      throw new Error(`Agent not found: ${data.agentId}`);
    }

    // Permission check - agent must belong to same user
    if (targetAgent.userId !== options.userId) {
      throw new Error(`Access denied to agent: ${data.agentId}`);
    }

    // Create new call stack with this agent
    const newCallStack = new Set(callStack);
    newCallStack.add(data.agentId);

    // Build sub-agent input(s) from field templates.
    // An array (literal or template resolving to an array) runs the agent once per item.
    const resolvedInputs = interpolateDeep(data.inputs ?? {}, { context });
    const isBatch = Array.isArray(resolvedInputs);
    const items = (isBatch ? resolvedInputs : [resolvedInputs]) as unknown[];

    console.log('data.inputs', data.inputs)
    console.log('items', items)

    // Validate every item against the target input schema before running anything
    const inputNode = targetAgent.nodes.find((n) => n.type === 'input');
    const schema = (inputNode?.data.schema as Record<string, InputFieldDef> | undefined) ?? {};

    items.forEach((item, index) => {
      if (item === null || typeof item !== 'object' || Array.isArray(item)) {
        throw new Error(`Input${isBatch ? ` item ${index}` : ''} for agent ${targetAgent.name} must be an object`);
      }
      const missingFields = Object.entries(schema)
        .filter(([key, def]) => def?.required && def.default === undefined && (item as Record<string, unknown>)[key] === undefined)
        .map(([key]) => key);
      if (missingFields.length > 0) {
        throw new Error(`Missing required input fields${isBatch ? ` in item ${index}` : ''} for agent ${targetAgent.name}: ${missingFields.join(', ')}`);
      }
    });

    // Execute the sub-agent for each item sequentially (pass all repositories and context)
    const executor = new WorkflowExecutor(options.runRepo, options.fileRepo);
    const runs = [];
    for (const [index, item] of items.entries()) {
      const subInput = item as Record<string, unknown>;
      const run = await executor.executeInternal(
        targetAgent,
        subInput,
        options.userId,
        {
          providers: options.providers,
          workflowInput: subInput,
          agentRepo: options.agentRepo,
          runRepo: options.runRepo,
          messageRepo: options.messageRepo,
          memorySchemaRepo: options.memorySchemaRepo,
          memoryStoreRepo: options.memoryStoreRepo,
          fileRepo: options.fileRepo,
          callStack: newCallStack,
          userId: options.userId,
          resolvedSecrets: options.resolvedSecrets,
          sessionId: options.sessionId,
          messages: options.messages,
          sessionNotes: options.sessionNotes,
          onSessionNotesUpdate: options.onSessionNotesUpdate,
          maxNotesLength: options.maxNotesLength,
          parentRunId: options.currentRunId,
          triggeredBy: { triggerType: 'agent_node', nodeId: node.id },
        }
      );

      if (run.status === 'failed') {
        throw new Error(`Sub-agent failed${isBatch ? ` on item ${index}` : ''}: ${run.error}`);
      }
      runs.push(run);
    }

    // Resolve nodeRef references to actual values for downstream nodes
    const resolvedOutputs = runs.map((run) => resolveRunOutput(run));
    const outputs = isBatch
      ? { output: resolvedOutputs, run: runs }
      : { output: resolvedOutputs[0], run: runs[0] };

    // Extract files from output, store in context with temp refs
    const { cleanedOutput, fileRefs } = extractAndStoreFiles(outputs, node.id, context);

    context.setOutput(node.id, 'output', (cleanedOutput as Record<string, unknown>).output);
    context.setOutput(node.id, 'run', (cleanedOutput as Record<string, unknown>).run);

    // Propagate files from sub-agent runs
    const allFileRefs = [...fileRefs];
    for (const run of runs) {
      if (run.files && run.files.length > 0) {
        allFileRefs.push(...run.files);
      }
    }

    return {
      outputs: cleanedOutput as Record<string, unknown>,
      files: allFileRefs.length > 0 ? allFileRefs : undefined,
    };
  }
}
