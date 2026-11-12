import { Types } from 'mongoose';
import type { Document, PipelineStage } from 'mongoose';
import { AgentScheduleModel, AgentScheduleDocument } from '../models/AgentScheduleModel.js';
import type {
  IAgentScheduleRepository,
  AgentScheduleQueryOptions,
} from '../../../../domain/interfaces/repositories/IAgentScheduleRepository.js';
import type {
  AgentSchedule,
  ScheduleTrigger,
  CreateAgentScheduleDTO,
  UpdateAgentScheduleDTO,
} from '../../../../domain/entities/AgentSchedule.js';
import { escapeRegex } from '../../../../utils/regex.js';

type AgentScheduleRecord = Omit<AgentScheduleDocument, keyof Document> & { _id: Types.ObjectId };

interface AgentScheduleWithWorkspace extends AgentScheduleRecord {
  workspace?: { name: string }[];
}

function addDateRange(query: Record<string, unknown>, field: string, after?: Date, before?: Date): void {
  if (!after && !before) return;
  query[field] = {
    ...(after ? { $gte: after } : {}),
    ...(before ? { $lte: before } : {}),
  };
}

export class MongoAgentScheduleRepository implements IAgentScheduleRepository {
  private toTrigger(raw: ScheduleTrigger): ScheduleTrigger {
    // Drop undefined/null keys left by the flat Mongoose subdocument
    const plain = Object.fromEntries(
      Object.entries(raw).filter(([, value]) => value !== undefined && value !== null)
    );
    return plain as ScheduleTrigger;
  }

  /** Accepts plain records (lean / aggregation results) */
  private toEntity(doc: AgentScheduleRecord, workspaceName?: string): AgentSchedule {
    return {
      id: doc._id.toString(),
      userId: doc.userId.toString(),
      agentId: doc.agentId.toString(),
      workspaceId: doc.workspaceId?.toString(),
      workspaceName,
      name: doc.name,
      description: doc.description,
      enabled: doc.enabled,
      trigger: this.toTrigger(doc.trigger),
      timezone: doc.timezone,
      input: doc.input ?? {},
      sessionMode: doc.sessionMode,
      sessionId: doc.sessionId,
      overlapPolicy: doc.overlapPolicy,
      stopAfterFailures: doc.stopAfterFailures,
      nextRunAt: doc.nextRunAt,
      lastRunAt: doc.lastRunAt,
      lastRunId: doc.lastRunId,
      lastStatus: doc.lastStatus,
      lastError: doc.lastError,
      runCount: doc.runCount,
      consecutiveFailures: doc.consecutiveFailures,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  /** Find schedules with workspaceName populated via $lookup */
  private async findWithWorkspace(
    match: Record<string, unknown>,
    sort?: Record<string, 1 | -1>,
    page?: { skip?: number; limit?: number }
  ): Promise<AgentSchedule[]> {
    const pipeline: PipelineStage[] = [{ $match: match }];
    if (sort) {
      pipeline.push({ $sort: sort });
    }
    if (page?.skip) {
      pipeline.push({ $skip: page.skip });
    }
    if (page?.limit) {
      pipeline.push({ $limit: page.limit });
    }
    pipeline.push({
      $lookup: {
        from: 'workspaces',
        localField: 'workspaceId',
        foreignField: '_id',
        pipeline: [{ $project: { name: 1 } }],
        as: 'workspace',
      },
    });

    const docs = await AgentScheduleModel.aggregate<AgentScheduleWithWorkspace>(pipeline);
    return docs.map((doc) => this.toEntity(doc, doc.workspace?.[0]?.name));
  }

  async findById(id: string): Promise<AgentSchedule | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const [schedule] = await this.findWithWorkspace({ _id: new Types.ObjectId(id) });
    return schedule ?? null;
  }

  private buildUserQuery(userId: string, options?: AgentScheduleQueryOptions): Record<string, unknown> {
    const query: Record<string, unknown> = { userId: new Types.ObjectId(userId) };

    if (options?.agentId) {
      query.agentId = new Types.ObjectId(options.agentId);
    }
    if (options?.workspaceId !== undefined) {
      query.workspaceId = options.workspaceId === null
        ? null
        : new Types.ObjectId(options.workspaceId);
    }
    if (options?.enabled !== undefined) {
      query.enabled = options.enabled;
    }
    if (options?.name) {
      query.name = { $regex: escapeRegex(options.name), $options: 'i' };
    }
    if (options?.description) {
      query.description = { $regex: escapeRegex(options.description), $options: 'i' };
    }
    if (options?.triggerType) {
      query['trigger.type'] = options.triggerType;
    }
    if (options?.lastStatus) {
      query.lastStatus = options.lastStatus;
    }
    if (options?.sessionMode) {
      query.sessionMode = options.sessionMode;
    }
    addDateRange(query, 'nextRunAt', options?.nextRunAfter, options?.nextRunBefore);
    addDateRange(query, 'createdAt', options?.createdAfter, options?.createdBefore);
    addDateRange(query, 'updatedAt', options?.updatedAfter, options?.updatedBefore);

    return query;
  }

  async findByUserId(userId: string, options?: AgentScheduleQueryOptions): Promise<AgentSchedule[]> {
    const query = this.buildUserQuery(userId, options);
    const sortField = options?.sortBy ?? 'updatedAt';
    const sortDirection = options?.sortOrder === 'asc' ? 1 : -1;

    return this.findWithWorkspace(
      query,
      { [sortField]: sortDirection, _id: sortDirection },
      { skip: options?.skip, limit: options?.limit }
    );
  }

  async countByUserId(userId: string, options?: AgentScheduleQueryOptions): Promise<number> {
    return AgentScheduleModel.countDocuments(this.buildUserQuery(userId, options));
  }

  async findDue(now: Date, limit: number): Promise<AgentSchedule[]> {
    const docs = await AgentScheduleModel.find({ enabled: true, nextRunAt: { $lte: now } })
      .sort({ nextRunAt: 1 })
      .limit(limit)
      .lean<AgentScheduleRecord[]>();
    // Runner path - workspaceName not needed
    return docs.map((doc) => this.toEntity(doc));
  }

  async findNextRunAt(): Promise<Date | null> {
    const doc = await AgentScheduleModel.findOne(
      { enabled: true, nextRunAt: { $ne: null } },
      { nextRunAt: 1 }
    ).sort({ nextRunAt: 1 });
    return doc?.nextRunAt ?? null;
  }

  async create(data: CreateAgentScheduleDTO): Promise<AgentSchedule> {
    const doc = await AgentScheduleModel.create({
      ...data,
      userId: new Types.ObjectId(data.userId),
      agentId: new Types.ObjectId(data.agentId),
      workspaceId: data.workspaceId ? new Types.ObjectId(data.workspaceId) : null,
    });
    return (await this.findById(doc._id.toString()))!;
  }

  async update(id: string, data: UpdateAgentScheduleDTO): Promise<AgentSchedule | null> {
    const $set: Record<string, unknown> = {};
    const $unset: Record<string, 1> = {};

    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) continue;
      if (key === 'workspaceId') {
        // Keep explicit null for "global" so workspace filtering matches
        $set[key] = value === null ? null : new Types.ObjectId(value as string);
      }
      else if (value === null) {
        $unset[key] = 1;
      }
      else {
        $set[key] = value;
      }
    }

    const update: Record<string, unknown> = {};
    if (Object.keys($set).length > 0) update.$set = $set;
    if (Object.keys($unset).length > 0) update.$unset = $unset;

    const doc = await AgentScheduleModel.findByIdAndUpdate(id, update, { new: true, runValidators: true });
    return doc ? this.findById(id) : null;
  }

  async delete(options: { id?: string; agentId?: string; workspaceId?: string; userId?: string }): Promise<number> {
    const query: Record<string, unknown> = {};
    if (options.id) query._id = new Types.ObjectId(options.id);
    if (options.agentId) query.agentId = new Types.ObjectId(options.agentId);
    if (options.workspaceId) query.workspaceId = new Types.ObjectId(options.workspaceId);
    if (options.userId) query.userId = new Types.ObjectId(options.userId);

    if (Object.keys(query).length === 0) {
      throw new Error('At least one delete filter is required');
    }

    const result = await AgentScheduleModel.deleteMany(query);
    return result.deletedCount;
  }

  async count(userId: string, workspaceId?: string | null): Promise<number> {
    const query: Record<string, unknown> = { userId: new Types.ObjectId(userId) };
    if (workspaceId !== undefined) {
      query.workspaceId = workspaceId === null ? null : new Types.ObjectId(workspaceId);
    }
    return AgentScheduleModel.countDocuments(query);
  }
}
