import mongoose from 'mongoose';
import { AgentModel, AgentDocument } from '../models/AgentModel.js';
import type { IAgentRepository } from '../../../../domain/interfaces/repositories/IAgentRepository.js';
import type {
  Agent,
  AgentListItem,
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
      editorData: doc.editorData,
      workspaceId: doc.workspaceId?.toString(),
      systemName: doc.systemName,
      defaultName: doc.defaultName,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  async findById(id: string): Promise<Agent | null> {
    const doc = await AgentModel.findById(id);
    return doc ? this.toEntity(doc) : null;
  }

  async findByUserId(userId: string, options: AgentQueryOptions = {}): Promise<AgentListResult> {
    const matchQuery: Record<string, unknown> = { userId: new mongoose.Types.ObjectId(userId) };

    // Filters
    if (options.id) {
      matchQuery._id = new mongoose.Types.ObjectId(options.id);
    }
    if (options.name) {
      matchQuery.name = { $regex: options.name, $options: 'i' };
    }
    if (options.description) {
      matchQuery.description = { $regex: options.description, $options: 'i' };
    }
    if (options.workspaceId !== undefined) {
      matchQuery.workspaceId = options.workspaceId === null
        ? null
        : new mongoose.Types.ObjectId(options.workspaceId);
    }
    if (options.createdAfter) {
      matchQuery.createdAt = { ...((matchQuery.createdAt as object) || {}), $gte: options.createdAfter };
    }
    if (options.createdBefore) {
      matchQuery.createdAt = { ...((matchQuery.createdAt as object) || {}), $lte: options.createdBefore };
    }

    // Sorting
    const sortField = options.sortBy || 'updatedAt';
    const sortOrder = options.sortOrder === 'asc' ? 1 : -1;
    const sort: Record<string, 1 | -1> = { [sortField]: sortOrder };

    // Pagination
    const skip = options.skip || 0;
    const limit = options.limit || 50;

    const [result] = await AgentModel.aggregate<{
      data: Array<Omit<AgentDocument, 'nodes'> & {
        workspaceName?: string;
        githubRepository?: string;
        githubPath?: string;
        nodesCount?: number;
      }>;
      total: Array<{ count: number }>;
    }>([
      { $match: matchQuery },
      {
        $addFields: {
          nodesCount: { $size: '$nodes' },
        },
      },
      {
        $project: {
          nodes: 0,
        },
      },
      {
        $lookup: {
          from: 'workspaces',
          localField: 'workspaceId',
          foreignField: '_id',
          as: 'workspace',
        },
      },
      {
        $unwind: {
          path: '$workspace',
          preserveNullAndEmptyArrays: true,
        },
      },
      // Lookup GitHub sync
      {
        $lookup: {
          from: 'githubsyncs',
          let: { agentId: '$_id', agentUserId: '$userId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$entityId', '$$agentId'] },
                    { $eq: ['$userId', '$$agentUserId'] },
                    { $eq: ['$entityType', 'agent'] },
                  ],
                },
              },
            },
            { $limit: 1 },
            { $project: { repository: 1, path: 1 } },
          ],
          as: 'githubSync',
        },
      },
      {
        $unwind: {
          path: '$githubSync',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $addFields: {
          workspaceName: '$workspace.name',
          githubRepository: '$githubSync.repository',
          githubPath: '$githubSync.path',
        },
      },
      {
        $project: {
          workspace: 0,
          githubSync: 0,
        },
      },
      {
        $facet: {
          data: [
            { $sort: sort },
            { $skip: skip },
            { $limit: limit },
          ],
          total: [{ $count: 'count' }],
        },
      },
    ]);

    const docs = result?.data ?? [];
    const total = result?.total[0]?.count ?? 0;

    return {
      agents: docs.map((doc) => this.toListItem(doc)),
      total,
    };
  }

  private toListItem(doc: Omit<AgentDocument, 'nodes'> & {
    workspaceName?: string;
    githubRepository?: string;
    githubPath?: string;
    nodesCount?: number;
  }): AgentListItem {
    return {
      id: doc._id.toString(),
      userId: doc.userId.toString(),
      name: doc.name,
      description: doc.description,
      editorData: doc.editorData,
      workspaceId: doc.workspaceId?.toString(),
      workspaceName: doc.workspaceName,
      systemName: doc.systemName,
      defaultName: doc.defaultName,
      githubRepository: doc.githubRepository,
      githubPath: doc.githubPath,
      nodesCount: doc.nodesCount,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  async findSystemAgentByName(name: string): Promise<Agent | null> {
    const doc = await AgentModel.findOne({ systemName: name });
    return doc ? this.toEntity(doc) : null;
  }

  async findAllSystemAgents(): Promise<Agent[]> {
    const docs = await AgentModel.find({ systemName: { $exists: true, $ne: null } }).sort({ name: 1 });
    return docs.map((doc) => this.toEntity(doc));
  }

  async findBySystemName(systemName: string): Promise<Agent | null> {
    const doc = await AgentModel.findOne({ systemName });
    return doc ? this.toEntity(doc) : null;
  }

  async findByDefaultName(defaultName: string): Promise<Agent | null> {
    const doc = await AgentModel.findOne({ defaultName });
    return doc ? this.toEntity(doc) : null;
  }

  async create(data: CreateAgentDTO): Promise<Agent> {
    const doc = await AgentModel.create({
      userId: data.userId,
      name: data.name,
      description: data.description ?? '',
      nodes: data.nodes ?? [],
      editorData: data.editorData,
      workspaceId: data.workspaceId,
      defaultName: data.defaultName,
    });
    return this.toEntity(doc);
  }

  async createSystemAgent(data: CreateAgentDTO): Promise<Agent> {
    const doc = await AgentModel.create({
      userId: data.userId,
      name: data.name,
      description: data.description ?? '',
      nodes: data.nodes ?? [],
      systemName: data.systemName,
      workspaceId: data.workspaceId
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

  async deleteByWorkspaceId(workspaceId: string): Promise<number> {
    const result = await AgentModel.deleteMany({ workspaceId });
    return result.deletedCount;
  }

  async count(): Promise<number> {
    return AgentModel.countDocuments();
  }
}
