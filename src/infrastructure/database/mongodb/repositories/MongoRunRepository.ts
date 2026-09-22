import mongoose from 'mongoose';
import { RunModel, RunDocument } from '../models/RunModel.js';
import type { IRunRepository, RunQueryOptions, RunQueryResult, RunSummaryQueryResult, RunWithChildrenQueryOptions } from '../../../../domain/interfaces/repositories/IRunRepository.js';
import type { Run, RunSummary, CreateRunDTO, RunStatus, NodeState } from '../../../../domain/entities/Run.js';

export class MongoRunRepository implements IRunRepository {
  private toEntity(doc: RunDocument, childDocs?: RunDocument[]): Run {
    const nodeStates: Record<string, NodeState> = {};
    if (doc.nodeStates) {
      // Handle both Map (from Mongoose) and plain object (from aggregation)
      if (doc.nodeStates instanceof Map) {
        doc.nodeStates.forEach((value, key) => {
          nodeStates[key] = value;
        });
      } else {
        // Plain object from aggregation
        Object.entries(doc.nodeStates as unknown as Record<string, NodeState>).forEach(([key, value]) => {
          nodeStates[key] = value;
        });
      }
    }

    const run: Run = {
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
      parentRunId: doc.parentRunId?.toString(),
      triggeredBy: doc.triggeredBy,
    };

    if (childDocs && childDocs.length > 0) {
      run.childRuns = childDocs.map((child) => this.toEntity(child));
    }

    return run;
  }

  private toSummary(doc: RunDocument, childIds?: string[]): RunSummary {
    const summary: RunSummary = {
      id: doc._id.toString(),
      agentId: doc.agentId.toString(),
      userId: doc.userId.toString(),
      status: doc.status,
      error: doc.error,
      startedAt: doc.startedAt,
      completedAt: doc.completedAt,
      parentRunId: doc.parentRunId?.toString(),
      triggeredBy: doc.triggeredBy,
    };

    if (childIds && childIds.length > 0) {
      summary.childRunIds = childIds;
    }

    return summary;
  }

  async findById(id: string): Promise<Run | null> {
    const doc = await RunModel.findById(id);
    return doc ? this.toEntity(doc) : null;
  }

  async findByIdWithChildren(id: string): Promise<Run | null> {
    const results = await RunModel.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(id) } },
      {
        $lookup: {
          from: 'runs',
          localField: '_id',
          foreignField: 'parentRunId',
          as: 'childRuns',
        },
      },
    ]);

    if (results.length === 0) {
      return null;
    }

    const doc = results[0];
    const childDocs = doc.childRuns as RunDocument[];
    delete doc.childRuns;
    return this.toEntity(doc as RunDocument, childDocs);
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
      parentRunId: data.parentRunId ? new mongoose.Types.ObjectId(data.parentRunId) : undefined,
      triggeredBy: data.triggeredBy,
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
    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
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

  async cancel(id: string): Promise<Run | null> {
    // Atomic cancel: pending -> cancelled, running -> cancelling
    // Uses aggregation pipeline update (MongoDB 4.2+) for conditional logic
    const doc = await RunModel.findOneAndUpdate(
      { _id: id, status: { $in: ['pending', 'running'] } },
      [
        {
          $set: {
            status: {
              $cond: { if: { $eq: ['$status', 'pending'] }, then: 'cancelled', else: 'cancelling' },
            },
            completedAt: {
              $cond: { if: { $eq: ['$status', 'pending'] }, then: new Date(), else: '$completedAt' },
            },
          },
        },
      ],
      { new: true }
    );
    return doc ? this.toEntity(doc) : null;
  }

  async findParentsWithChildren(options?: RunWithChildrenQueryOptions): Promise<RunQueryResult> {
    const match: Record<string, unknown> = {
      parentRunId: { $exists: false },
    };

    if (options?.userId) {
      match.userId = options.userId;
    }
    if (options?.agentId) {
      match.agentId = options.agentId;
    }
    if (options?.status) {
      match.status = options.status;
    }
    if (options?.startedAfter || options?.startedBefore) {
      match.startedAt = {};
      if (options.startedAfter) {
        (match.startedAt as Record<string, Date>).$gte = options.startedAfter;
      }
      if (options.startedBefore) {
        (match.startedAt as Record<string, Date>).$lte = options.startedBefore;
      }
    }

    const sortField = options?.sortBy ?? 'startedAt';
    const sortOrder = options?.sortOrder === 'asc' ? 1 : -1;
    const skip = options?.skip ?? 0;
    const limit = options?.limit ?? 50;

    const [results, countResult] = await Promise.all([
      RunModel.aggregate([
        { $match: match },
        { $sort: { [sortField]: sortOrder } },
        { $skip: skip },
        { $limit: limit },
        {
          $lookup: {
            from: 'runs',
            localField: '_id',
            foreignField: 'parentRunId',
            as: 'childRuns',
          },
        },
      ]),
      RunModel.countDocuments(match),
    ]);

    const runs = results.map((doc) => {
      const childDocs = doc.childRuns as RunDocument[];
      delete doc.childRuns;
      return this.toEntity(doc as RunDocument, childDocs);
    });

    return { runs, total: countResult };
  }

  // Summary projection - excludes input, output, nodeStates for efficiency
  private static readonly SUMMARY_PROJECTION = {
    _id: 1,
    agentId: 1,
    userId: 1,
    status: 1,
    error: 1,
    startedAt: 1,
    completedAt: 1,
    parentRunId: 1,
    triggeredBy: 1,
  };

  async findAllSummary(options?: RunQueryOptions): Promise<RunSummaryQueryResult> {
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
        .select(MongoRunRepository.SUMMARY_PROJECTION)
        .sort({ [sortField]: sortOrder })
        .skip(options?.skip ?? 0)
        .limit(options?.limit ?? 50),
      RunModel.countDocuments(query),
    ]);

    return {
      runs: docs.map((doc) => this.toSummary(doc)),
      total,
    };
  }

  async findParentsWithChildIdsSummary(options?: RunWithChildrenQueryOptions): Promise<RunSummaryQueryResult> {
    const match: Record<string, unknown> = {
      parentRunId: { $exists: false },
    };

    if (options?.userId) {
      match.userId = options.userId;
    }
    if (options?.agentId) {
      match.agentId = options.agentId;
    }
    if (options?.status) {
      match.status = options.status;
    }
    if (options?.startedAfter || options?.startedBefore) {
      match.startedAt = {};
      if (options.startedAfter) {
        (match.startedAt as Record<string, Date>).$gte = options.startedAfter;
      }
      if (options.startedBefore) {
        (match.startedAt as Record<string, Date>).$lte = options.startedBefore;
      }
    }

    const sortField = options?.sortBy ?? 'startedAt';
    const sortOrder = options?.sortOrder === 'asc' ? 1 : -1;
    const skip = options?.skip ?? 0;
    const limit = options?.limit ?? 50;

    const [results, countResult] = await Promise.all([
      RunModel.aggregate([
        { $match: match },
        {
          $project: {
            ...MongoRunRepository.SUMMARY_PROJECTION,
          },
        },
        { $sort: { [sortField]: sortOrder } },
        { $skip: skip },
        { $limit: limit },
        {
          $lookup: {
            from: 'runs',
            localField: '_id',
            foreignField: 'parentRunId',
            pipeline: [{ $project: { _id: 1 } }], // Only get child IDs
            as: 'childRuns',
          },
        },
      ]),
      RunModel.countDocuments(match),
    ]);

    const runs = results.map((doc) => {
      const childIds = (doc.childRuns as { _id: mongoose.Types.ObjectId }[]).map((c) => c._id.toString());
      delete doc.childRuns;
      return this.toSummary(doc as RunDocument, childIds);
    });

    return { runs, total: countResult };
  }
}
