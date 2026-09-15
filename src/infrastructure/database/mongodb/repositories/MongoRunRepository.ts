import { RunModel, RunDocument } from '../models/RunModel.js';
import type { IRunRepository, RunQueryOptions, RunQueryResult } from '../../../../domain/interfaces/repositories/IRunRepository.js';
import type { Run, CreateRunDTO, RunStatus, NodeState } from '../../../../domain/entities/Run.js';

export class MongoRunRepository implements IRunRepository {
  private toEntity(doc: RunDocument): Run {
    const nodeStates: Record<string, NodeState> = {};
    if (doc.nodeStates) {
      doc.nodeStates.forEach((value, key) => {
        nodeStates[key] = value;
      });
    }

    return {
      id: doc._id.toString(),
      agentId: doc.agentId.toString(),
      userId: doc.userId.toString(),
      input: doc.input,
      output: doc.output,
      files: doc.files,
      status: doc.status,
      nodeStates,
      error: doc.error,
      startedAt: doc.startedAt,
      completedAt: doc.completedAt,
    };
  }

  async findById(id: string): Promise<Run | null> {
    const doc = await RunModel.findById(id);
    return doc ? this.toEntity(doc) : null;
  }

  async findByAgentId(agentId: string, limit = 50): Promise<Run[]> {
    const docs = await RunModel.find({ agentId })
      .sort({ startedAt: -1 })
      .limit(limit);
    return docs.map((doc) => this.toEntity(doc));
  }

  async findByUserId(userId: string, limit = 50): Promise<Run[]> {
    const docs = await RunModel.find({ userId })
      .sort({ startedAt: -1 })
      .limit(limit);
    return docs.map((doc) => this.toEntity(doc));
  }

  async findAll(options?: RunQueryOptions): Promise<RunQueryResult> {
    const query: Record<string, unknown> = {};

    if (options?.userId) {
      query.userId = options.userId;
    }
    if (options?.agentId) {
      query.agentId = options.agentId;
    }
    if (options?.status) {
      query.status = options.status;
    }
    if (options?.startedAfter || options?.startedBefore) {
      query.startedAt = {};
      if (options.startedAfter) {
        (query.startedAt as Record<string, Date>).$gte = options.startedAfter;
      }
      if (options.startedBefore) {
        (query.startedAt as Record<string, Date>).$lte = options.startedBefore;
      }
    }

    const sortField = options?.sortBy ?? 'startedAt';
    const sortOrder = options?.sortOrder === 'asc' ? 1 : -1;

    const [docs, total] = await Promise.all([
      RunModel.find(query)
        .sort({ [sortField]: sortOrder })
        .skip(options?.skip ?? 0)
        .limit(options?.limit ?? 50),
      RunModel.countDocuments(query),
    ]);

    return {
      runs: docs.map((doc) => this.toEntity(doc)),
      total,
    };
  }

  async create(data: CreateRunDTO): Promise<Run> {
    const doc = await RunModel.create({
      agentId: data.agentId,
      userId: data.userId,
      input: data.input,
      status: 'pending',
      nodeStates: new Map(),
      startedAt: new Date(),
    });
    return this.toEntity(doc);
  }

  async updateStatus(
    id: string,
    status: RunStatus,
    error?: string | null
  ): Promise<Run | null> {
    const update: Record<string, unknown> = { status };
    if (error !== undefined) {
      update['error'] = error;
    }
    if (status === 'completed' || status === 'failed') {
      update['completedAt'] = new Date();
    }

    const doc = await RunModel.findByIdAndUpdate(id, { $set: update }, { new: true });
    return doc ? this.toEntity(doc) : null;
  }

  async updateNodeState(
    id: string,
    nodeId: string,
    state: Partial<NodeState>
  ): Promise<Run | null> {
    const update: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(state)) {
      update[`nodeStates.${nodeId}.${key}`] = value;
    }

    const doc = await RunModel.findByIdAndUpdate(id, { $set: update }, { new: true });
    return doc ? this.toEntity(doc) : null;
  }

  async setOutput(id: string, output: Record<string, unknown>): Promise<Run | null> {
    const doc = await RunModel.findByIdAndUpdate(
      id,
      { $set: { output } },
      { new: true }
    );
    return doc ? this.toEntity(doc) : null;
  }

  async complete(id: string, output: Record<string, unknown>, files?: string[]): Promise<Run | null> {
    const update: Record<string, unknown> = {
      status: 'completed',
      output,
      completedAt: new Date(),
    };
    if (files && files.length > 0) {
      update.files = files;
    }
    const doc = await RunModel.findByIdAndUpdate(
      id,
      { $set: update },
      { new: true }
    );
    return doc ? this.toEntity(doc) : null;
  }

  async fail(id: string, error: string): Promise<Run | null> {
    const doc = await RunModel.findByIdAndUpdate(
      id,
      {
        $set: {
          status: 'failed',
          error,
          completedAt: new Date(),
        },
      },
      { new: true }
    );
    return doc ? this.toEntity(doc) : null;
  }
}
