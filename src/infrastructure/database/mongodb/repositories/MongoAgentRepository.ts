import { AgentModel, AgentDocument } from '../models/AgentModel.js';
import type { IAgentRepository } from '../../../../domain/interfaces/repositories/IAgentRepository.js';
import type {
  Agent,
  CreateAgentDTO,
  UpdateAgentDTO,
  AgentQueryOptions,
  AgentListResult,
} from '../../../../domain/entities/Agent.js';

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
      isSystem: doc.isSystem,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  async findById(id: string): Promise<Agent | null> {
    const doc = await AgentModel.findById(id);
    return doc ? this.toEntity(doc) : null;
  }

  async findByUserId(userId: string, options: AgentQueryOptions = {}): Promise<AgentListResult> {
    const query: Record<string, unknown> = { userId };

    // Filters
    if (options.id) {
      query._id = options.id;
    }
    if (options.name) {
      query.name = { $regex: options.name, $options: 'i' };
    }
    if (options.description) {
      query.description = { $regex: options.description, $options: 'i' };
    }
    if (options.isSystem !== undefined) {
      query.isSystem = options.isSystem;
    } 
    if (options.createdAfter) {
      query.createdAt = { ...((query.createdAt as object) || {}), $gte: options.createdAfter };
    }
    if (options.createdBefore) {
      query.createdAt = { ...((query.createdAt as object) || {}), $lte: options.createdBefore };
    }

    // Sorting
    const sortField = options.sortBy || 'updatedAt';
    const sortOrder = options.sortOrder === 'asc' ? 1 : -1;
    const sort: Record<string, 1 | -1> = { [sortField]: sortOrder };

    // Count total before pagination
    const total = await AgentModel.countDocuments(query);

    // Pagination
    const skip = options.skip || 0;
    const limit = options.limit || 50;

    const docs = await AgentModel.find(query).sort(sort).skip(skip).limit(limit);

    return {
      agents: docs.map((doc) => this.toEntity(doc)),
      total,
    };
  }

  async findSystemAgentByName(name: string): Promise<Agent | null> {
    const doc = await AgentModel.findOne({ name, isSystem: true });
    return doc ? this.toEntity(doc) : null;
  }

  async findAllSystemAgents(): Promise<Agent[]> {
    const docs = await AgentModel.find({ isSystem: true }).sort({ name: 1 });
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
      isSystem: false,
    });
    return this.toEntity(doc);
  }

  async createSystemAgent(data: CreateAgentDTO): Promise<Agent> {
    const doc = await AgentModel.create({
      userId: data.userId,
      name: data.name,
      description: data.description ?? '',
      nodes: data.nodes ?? [],
      edges: data.edges ?? [],
      variables: data.variables ?? [],
      isSystem: true,
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
