import {
  Agent,
  CreateAgentDTO,
  UpdateAgentDTO,
  AgentQueryOptions,
  AgentListResult,
} from '../../entities/Agent.js';

export interface IAgentRepository {
  findById(id: string): Promise<Agent | null>;
  findByUserId(userId: string, options?: AgentQueryOptions): Promise<AgentListResult>;
  findSystemAgentByName(name: string): Promise<Agent | null>;
  findAllSystemAgents(): Promise<Agent[]>;
  create(data: CreateAgentDTO): Promise<Agent>;
  createSystemAgent(data: CreateAgentDTO): Promise<Agent>;
  update(id: string, data: UpdateAgentDTO): Promise<Agent | null>;
  delete(id: string): Promise<boolean>;
  count(): Promise<number>;
}
