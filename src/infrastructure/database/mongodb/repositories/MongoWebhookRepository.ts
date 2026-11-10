import { Types } from 'mongoose';
import { WebhookModel, WebhookDocument } from '../models/WebhookModel.js';
import { AgentModel } from '../models/AgentModel.js';
import type { IWebhookRepository } from '../../../../domain/interfaces/repositories/IWebhookRepository.js';
import type {
  Webhook,
  CreateWebhookDTO,
  UpdateWebhookDTO,
  WebhookQueryOptions,
  WebhookListResult,
} from '../../../../domain/entities/Webhook.js';

interface WebhookWithAgent extends WebhookDocument {
  agent?: { name: string }[];
}

export class MongoWebhookRepository implements IWebhookRepository {
  private toEntity(doc: WebhookDocument, agentName?: string): Webhook {
    return {
      id: doc._id.toString(),
      userId: doc.userId.toString(),
      agentId: doc.agentId.toString(),
      agentName,
      name: doc.name,
      token: doc.token,
      enabled: doc.enabled,
      handler: doc.handler ?? null,
      lastTriggeredAt: doc.lastTriggeredAt,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  async findById(id: string): Promise<Webhook | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await WebhookModel.findById(id);
    return doc ? this.toEntity(doc) : null;
  }

  async findByUserId(userId: string, options: WebhookQueryOptions = {}): Promise<WebhookListResult> {
    const query: Record<string, unknown> = { userId: new Types.ObjectId(userId) };
    if (options.agentId) query.agentId = new Types.ObjectId(options.agentId);
    if (options.workspaceId !== undefined) {
      // Webhooks inherit the workspace of their agent
      const agentIds = await AgentModel.distinct('_id', {
        userId: new Types.ObjectId(userId),
        workspaceId: options.workspaceId === null ? null : new Types.ObjectId(options.workspaceId),
      });
      query.agentId = options.agentId
        ? { $in: agentIds.filter((id) => id.toString() === options.agentId) }
        : { $in: agentIds };
    }

    const [docs, total] = await Promise.all([
      WebhookModel.aggregate<WebhookWithAgent>([
        { $match: query },
        { $sort: { createdAt: -1 } },
        { $skip: options.skip ?? 0 },
        { $limit: options.limit ?? 50 },
        {
          $lookup: {
            from: 'agents',
            localField: 'agentId',
            foreignField: '_id',
            as: 'agent',
            pipeline: [{ $project: { name: 1 } }],
          },
        },
      ]),
      WebhookModel.countDocuments(query),
    ]);
    return {
      webhooks: docs.map((doc) => this.toEntity(doc, doc.agent?.[0]?.name)),
      total,
    };
  }

  async create(data: CreateWebhookDTO): Promise<Webhook> {
    const doc = await WebhookModel.create({
      userId: data.userId,
      agentId: data.agentId,
      name: data.name,
      token: data.token,
      handler: data.handler ?? null,
    });
    return this.toEntity(doc);
  }

  async update(id: string, data: UpdateWebhookDTO): Promise<Webhook | null> {
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.enabled !== undefined) updateData.enabled = data.enabled;
    if (data.handler !== undefined) updateData.handler = data.handler;
    if (data.token !== undefined) updateData.token = data.token;
    if (data.lastTriggeredAt !== undefined) updateData.lastTriggeredAt = data.lastTriggeredAt;

    const doc = await WebhookModel.findByIdAndUpdate(id, { $set: updateData }, { new: true });
    return doc ? this.toEntity(doc) : null;
  }

  async delete(options: { id?: string; agentId?: string }): Promise<number> {
    const query: Record<string, unknown> = {};
    if (options.id) query._id = options.id;
    if (options.agentId) query.agentId = new Types.ObjectId(options.agentId);
    const result = await WebhookModel.deleteMany(query);
    return result.deletedCount;
  }
}
