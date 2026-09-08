import { AgentModel, AgentDocument } from '../models/AgentModel.js';
import type { IAgentRepository } from '../../../../domain/interfaces/repositories/IAgentRepository.js';
import type { Agent, CreateAgentDTO, UpdateAgentDTO } from '../../../../domain/entities/Agent.js';

export class MongoAgentRepository implements IAgentRepository {
  private toEntity(doc: AgentDocument): Agent {
    return {
      id: doc._id.toString(),
      userId: doc.userId.toString(),
      name: doc.name,
      description: doc.description,
      nodes: doc.nodes,
      edges: doc.edges,
      variables: doc.variables,
      status: doc.status,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  async findById(id: string): Promise<Agent | null> {
    const doc = await AgentModel.findById(id);
    return doc ? this.toEntity(doc) : null;
  }

  async findByUserId(userId: string): Promise<Agent[]> {
    const docs = await AgentModel.find({ userId }).sort({ updatedAt: -1 });
    return docs.map((doc) => this.toEntity(doc));
  }

  async create(data: CreateAgentDTO): Promise<Agent> {
    const doc = await AgentModel.create({
      userId: data.userId,
      name: data.name,
      description: data.description ?? '',
      nodes: data.nodes ?? [],
      edges: data.edges ?? [],
      variables: data.variables ?? [],
      status: 'draft',
    });
    return this.toEntity(doc);
  }

  async update(id: string, data: UpdateAgentDTO): Promise<Agent | null> {
    const doc = await AgentModel.findByIdAndUpdate(id, { $set: data }, { new: true });
    return doc ? this.toEntity(doc) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await AgentModel.findByIdAndDelete(id);
    return result !== null;
  }

  async count(): Promise<number> {
    return AgentModel.countDocuments();
  }
}
