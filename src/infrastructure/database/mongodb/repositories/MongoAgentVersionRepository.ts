import { AgentVersionModel, AgentVersionDocument } from '../models/AgentVersionModel.js';
import type { IAgentVersionRepository } from '../../../../domain/interfaces/repositories/IAgentVersionRepository.js';
import type {
  Agent,
  AgentVersion,
  AgentVersionListResult,
} from '../../../../domain/entities/Agent.js';
import { config } from '../../../../config/index.js';

export class MongoAgentVersionRepository implements IAgentVersionRepository {
  private toEntity(doc: AgentVersionDocument): AgentVersion {
    return {
      id: doc._id.toString(),
      agentIdRef: doc.agentIdRef.toString(),
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

  async createSnapshot(agent: Agent): Promise<AgentVersion> {
    // Check current snapshot count for this agent
    const currentCount = await AgentVersionModel.countDocuments({ agentIdRef: agent.id });
    const maxSnapshots = config.agentVersions.maxSnapshots;

    // If at limit, delete oldest snapshot(s)
    if (currentCount >= maxSnapshots) {
      const oldestSnapshots = await AgentVersionModel.find({ agentIdRef: agent.id })
        .sort({ createdAt: 1 })
        .limit( currentCount - maxSnapshots + 1 )
        .select('_id');
      await AgentVersionModel.deleteMany({ _id: { $in: oldestSnapshots.map(doc => doc._id) } });
    }

    return this.toEntity(
      await AgentVersionModel.create({
        agentIdRef: agent.id,
        userId: agent.userId,
        name: agent.name,
        description: agent.description,
        nodes: agent.nodes,
        editorData: agent.editorData,
        workspaceId: agent.workspaceId,
        systemName: agent.systemName,
        defaultName: agent.defaultName,
      })
    );
  }

  async findVersionsByAgentId(
    agentId: string,
    options: { skip?: number; limit?: number } = {}
  ): Promise<AgentVersionListResult> {
    const skip = options.skip ?? 0;
    const limit = options.limit ?? 50;

    const [docs, total] = await Promise.all([
      AgentVersionModel.find({ agentIdRef: agentId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      AgentVersionModel.countDocuments({ agentIdRef: agentId }),
    ]);

    return {
      versions: docs.map((doc) => this.toEntity(doc)),
      total,
    };
  }

  async findVersionById(versionId: string): Promise<AgentVersion | null> {
    const doc = await AgentVersionModel.findById(versionId);
    return doc ? this.toEntity(doc) : null;
  }

  async deleteVersionsByAgentId(agentId: string): Promise<number> {
    const result = await AgentVersionModel.deleteMany({ agentIdRef: agentId });
    return result.deletedCount ?? 0;
  }
}
