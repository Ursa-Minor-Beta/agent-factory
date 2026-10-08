import type {
  Agent,
  AgentVersion,
  AgentVersionListResult,
} from '../../entities/Agent.js';

export interface IAgentVersionRepository {
  createSnapshot(agent: Agent): Promise<AgentVersion>;
  findVersionsByAgentId(agentId: string, options?: { skip?: number; limit?: number }): Promise<AgentVersionListResult>;
  findVersionById(versionId: string): Promise<AgentVersion | null>;
  deleteVersionsByAgentId(agentId: string): Promise<number>;
}
