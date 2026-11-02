import {
  Agent,
  AgentWithDetails,
  CreateAgentDTO,
  UpdateAgentDTO,
  AgentQueryOptions,
  AgentListResult,
  AgentGraphItem,
} from '../../entities/Agent.js';

export interface AgentGraphQuery {
  userId: string;
  workspaceId?: string;
  ids?: string[];
  /** Agents whose references target any of these ids */
  referencedAgentIds?: string[];
}

export interface IAgentRepository {
  findById(id: string): Promise<AgentWithDetails | null>;
  findByUserId(userId: string, options?: AgentQueryOptions): Promise<AgentListResult>;
  findSystemAgentByName(name: string): Promise<Agent | null>;
  findAllSystemAgents(): Promise<Agent[]>;
  findBySystemName(systemName: string): Promise<Agent | null>;
  findByDefaultName(defaultName: string): Promise<Agent | null>;
  create(data: CreateAgentDTO): Promise<Agent>;
  createSystemAgent(data: CreateAgentDTO): Promise<Agent>;
  update(id: string, data: UpdateAgentDTO): Promise<Agent | null>;
  delete(options: { id?: string; workspaceId?: string; userId?: string }): Promise<number>;
  count(): Promise<number>;
  findGraphItems(query: AgentGraphQuery): Promise<AgentGraphItem[]>;
}
