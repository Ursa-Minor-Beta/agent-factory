import type { ExecutionOptions } from '../base.js';
import { WorkflowExecutor } from '../../executor.js';
import { resolveRunOutput } from '../../../utils/node-ref.js';

/**
 * Execute a sub-agent as a tool call
 */
export async function executeSubAgent(
  agentId: string,
  input: Record<string, unknown>,
  options: ExecutionOptions,
  nodeId: string,
  toolName: string
): Promise<unknown> {
  if (!options.agentRepo || !options.runRepo) {
    throw new Error('Tool calling requires agentRepo and runRepo in options');
  }

  if (!options.userId) {
    throw new Error('Tool calling requires userId in options');
  }

  // Check for circular call
  const callStack = options.callStack ?? new Set<string>();
  if (callStack.has(agentId)) {
    const chain = [...callStack, agentId].join(' → ');
    throw new Error(`Circular agent call detected: ${chain}`);
  }

  // Load the target agent
  const targetAgent = await options.agentRepo.findById(agentId);
  if (!targetAgent) {
    throw new Error(`Agent not found: ${agentId}`);
  }

  // Permission check - allow access to user's agents or system agents
  if (targetAgent.userId !== options.userId && !targetAgent.systemName) {
    throw new Error(`Access denied to agent: ${agentId}`);
  }

  // Create new call stack with this agent
  const newCallStack = new Set(callStack);
  newCallStack.add(agentId);

  // Execute the sub-agent (pass all repositories and context)
  const executor = new WorkflowExecutor(options.runRepo, options.fileRepo);
  const run = await executor.executeInternal(
    targetAgent,
    input,
    options.userId,
    {
      providers: options.providers,
      workflowInput: input,
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
      triggeredBy: { triggerType: 'tool_call', nodeId, toolName },
    }
  );

  if (run.status === 'failed') {
    throw new Error(`Sub-agent failed: ${run.error}`);
  }

  return resolveRunOutput(run);
}
