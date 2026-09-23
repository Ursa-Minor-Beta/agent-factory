import type { ExecutionOptions } from '../base.js';
import type { WorkflowNode } from '../../../domain/entities/Agent.js';
import { MAX_SESSION_NOTES_LENGTH } from '../../tools/session-notes.js';

type ToolHandler = (
  args: Record<string, unknown>,
  options: ExecutionOptions
) => Promise<unknown>;

/**
 * Handle create_agent tool
 */
const handleCreateAgent: ToolHandler = async (args, options) => {
  if (!options.agentRepo) {
    throw new Error('create_agent tool requires agentRepo in options');
  }
  if (!options.userId) {
    throw new Error('create_agent tool requires userId in options');
  }

  const name = String(args.name ?? '');
  const description = String(args.description ?? '');
  const nodes = args.nodes as Array<Record<string, unknown>> | undefined;

  if (!name) {
    return { success: false, error: 'Agent name is required' };
  }
  if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
    return { success: false, error: 'At least one node is required' };
  }

  const hasInput = nodes.some((n) => n.type === 'input');
  const hasOutput = nodes.some((n) => n.type === 'output');
  if (!hasInput) {
    return { success: false, error: 'Workflow must have at least one input node' };
  }
  if (!hasOutput) {
    return { success: false, error: 'Workflow must have at least one output node' };
  }

  const agent = await options.agentRepo.create({
    userId: options.userId,
    name,
    description,
    nodes: nodes as unknown as WorkflowNode[],
  });

  return {
    success: true,
    agentId: agent.id,
    name: agent.name,
    message: `Agent "${name}" created successfully with ID: ${agent.id}`,
  };
};

/**
 * Handle get_agent tool
 */
const handleGetAgent: ToolHandler = async (args, options) => {
  if (!options.agentRepo) {
    throw new Error('get_agent tool requires agentRepo in options');
  }
  if (!options.userId) {
    throw new Error('get_agent tool requires userId in options');
  }

  const agentId = String(args.agentId ?? '');
  if (!agentId) {
    return { success: false, error: 'Agent ID is required' };
  }

  const agent = await options.agentRepo.findById(agentId);
  if (!agent) {
    return { success: false, error: `Agent not found: ${agentId}` };
  }

  if (agent.userId !== options.userId && !agent.isSystem) {
    return { success: false, error: 'Access denied' };
  }

  return {
    success: true,
    agent: {
      id: agent.id,
      name: agent.name,
      description: agent.description,
      nodes: agent.nodes,
      isSystem: agent.isSystem,
    },
  };
};

/**
 * Handle update_session_notes tool
 */
const handleUpdateSessionNotes: ToolHandler = async (args, options) => {
  const maxLength = options.maxNotesLength ?? MAX_SESSION_NOTES_LENGTH;
  let notes = String(args.notes ?? '');
  const wasTruncated = notes.length > maxLength;
  if (wasTruncated) {
    notes = notes.slice(0, maxLength);
  }
  if (options.onSessionNotesUpdate) {
    await options.onSessionNotesUpdate(notes);
  }
  return {
    success: true,
    message: wasTruncated
      ? `Session notes updated (truncated from ${String(args.notes).length} to ${maxLength} chars)`
      : 'Session notes updated',
    length: notes.length,
    maxLength,
  };
};

/**
 * Handle append_session_notes tool
 */
const handleAppendSessionNotes: ToolHandler = async (args, options) => {
  const maxLength = options.maxNotesLength ?? MAX_SESSION_NOTES_LENGTH;
  const toAppend = String(args.notes ?? '');
  const current = options.sessionNotes ?? '';
  let newNotes = current ? `${current}\n${toAppend}` : toAppend;
  const wasTruncated = newNotes.length > maxLength;
  if (wasTruncated) {
    newNotes = newNotes.slice(0, maxLength);
  }
  if (options.onSessionNotesUpdate) {
    await options.onSessionNotesUpdate(newNotes);
  }
  return {
    success: true,
    message: wasTruncated
      ? `Notes appended but truncated to ${maxLength} chars`
      : 'Notes appended',
    length: newNotes.length,
    maxLength,
  };
};

/**
 * Handle update_agent tool
 */
const handleUpdateAgent: ToolHandler = async (args, options) => {
  if (!options.agentRepo) {
    throw new Error('update_agent tool requires agentRepo in options');
  }
  if (!options.userId) {
    throw new Error('update_agent tool requires userId in options');
  }

  const agentId = String(args.agentId ?? '');
  if (!agentId) {
    return { success: false, error: 'Agent ID is required' };
  }

  const existingAgent = await options.agentRepo.findById(agentId);
  if (!existingAgent) {
    return { success: false, error: `Agent not found: ${agentId}` };
  }

  if (existingAgent.userId !== options.userId) {
    return { success: false, error: 'Access denied' };
  }
  if (existingAgent.isSystem) {
    return { success: false, error: 'Cannot modify system agents' };
  }

  const updates: Record<string, unknown> = {};
  if (args.name !== undefined) {
    updates.name = String(args.name);
  }
  if (args.description !== undefined) {
    updates.description = String(args.description);
  }
  if (args.nodes !== undefined) {
    const nodes = args.nodes as Array<Record<string, unknown>>;
    if (!Array.isArray(nodes) || nodes.length === 0) {
      return { success: false, error: 'At least one node is required' };
    }
    const hasInput = nodes.some((n) => n.type === 'input');
    const hasOutput = nodes.some((n) => n.type === 'output');
    if (!hasInput) {
      return { success: false, error: 'Workflow must have at least one input node' };
    }
    if (!hasOutput) {
      return { success: false, error: 'Workflow must have at least one output node' };
    }
    updates.nodes = nodes;
  }

  if (Object.keys(updates).length === 0) {
    return { success: false, error: 'No updates provided' };
  }

  const updatedAgent = await options.agentRepo.update(agentId, updates);
  if (!updatedAgent) {
    return { success: false, error: 'Failed to update agent' };
  }

  return {
    success: true,
    agentId: updatedAgent.id,
    name: updatedAgent.name,
    message: `Agent "${updatedAgent.name}" updated successfully`,
  };
};

/**
 * Registry of builtin tool handlers
 */
const builtinToolHandlers: Record<string, ToolHandler> = {
  create_agent: handleCreateAgent,
  get_agent: handleGetAgent,
  update_agent: handleUpdateAgent,
  update_session_notes: handleUpdateSessionNotes,
  append_session_notes: handleAppendSessionNotes,
};

/**
 * Execute a builtin tool by name
 */
export async function executeBuiltinTool(
  toolName: string,
  args: Record<string, unknown>,
  options: ExecutionOptions
): Promise<unknown> {
  const handler = builtinToolHandlers[toolName];
  if (!handler) {
    throw new Error(`Unknown builtin tool: ${toolName}`);
  }
  return handler(args, options);
}
