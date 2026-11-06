import type { Agent } from '../domain/entities/Agent.js';
import type { IAgentRepository } from '../domain/interfaces/repositories/IAgentRepository.js';

/**
 * Workspace for workspace-scoped resources (collections, memory).
 * System agents (e.g. agent-builder) are global but may act on another agent;
 * when input.agentId points to an agent owned by the user, scope to that agent's workspace,
 * otherwise fall back to global (no workspace).
 */
export async function resolveWorkspaceId(
  agent: Agent,
  input: Record<string, unknown>,
  userId: string,
  agentRepo?: IAgentRepository
): Promise<string | undefined> {
  if (!agent.systemName) {
    return agent.workspaceId;
  }
  const targetId = input['agentId'];
  if (typeof targetId !== 'string' || !targetId || !agentRepo) {
    return undefined;
  }
  const target = await agentRepo.findById(targetId).catch(() => null);
  if (!target || target.userId !== userId) {
    return undefined;
  }
  return target.workspaceId;
}
