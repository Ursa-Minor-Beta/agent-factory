import { Agent, CreateAgentDTO, UpdateAgentDTO } from '../../entities/Agent.js';

export interface IAgentRepository {
  findById(id: string): Promise<Agent | null>;
  findByUserId(userId: string): Promise<Agent[]>;
  findSystemAgentByName(name: string): Promise<Agent | null>;
  findAllSystemAgents(): Promise<Agent[]>;
  create(data: CreateAgentDTO): Promise<Agent>;
  createSystemAgent(data: CreateAgentDTO): Promise<Agent>;
  update(id: string, data: UpdateAgentDTO): Promise<Agent | null>;
  delete(id: string): Promise<boolean>;
  count(): Promise<number>;
}
