import { Types } from 'mongoose';
import { MemorySchemaModel, MemorySchemaDocument } from '../models/MemorySchemaModel.js';
import { WorkspaceModel } from '../models/WorkspaceModel.js';
import type {
  IMemorySchemaRepository,
  MemorySchemaQueryOptions,
} from '../../../../domain/interfaces/repositories/IMemorySchemaRepository.js';
import type {
  MemorySchema,
  CreateMemorySchemaDTO,
  UpdateMemorySchemaDTO,
} from '../../../../domain/entities/Memory.js';

interface MemorySchemaWithWorkspace extends MemorySchemaDocument {
  workspace?: { name: string }[];
}

export class MongoMemorySchemaRepository implements IMemorySchemaRepository {
  private toEntity(doc: MemorySchemaDocument, workspaceName?: string): MemorySchema {
    return {
      id: doc._id.toString(),
      userId: doc.userId.toString(),
      name: doc.name,
      description: doc.description,
      fields: doc.fields.map((f) => ({
        name: f.name,
        type: f.type,
        required: f.required,
        index: f.index,
        description: f.description ?? undefined,
        default: f.default ?? undefined,
        items: f.items ?? undefined,
      })),
      workspaceId: doc.workspaceId?.toString(),
      workspaceName,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  private async getWorkspaceName(workspaceId: Types.ObjectId | string | null | undefined): Promise<string | undefined> {
    if (!workspaceId) return undefined;
    const workspace = await WorkspaceModel.findById(workspaceId, { name: 1 });
    return workspace?.name;
  }

  async findById(id: string): Promise<MemorySchema | null> {
    const doc = await MemorySchemaModel.findById(id);
    if (!doc) return null;
    const workspaceName = await this.getWorkspaceName(doc.workspaceId);
    return this.toEntity(doc, workspaceName);
  }

  async findByName(
    userId: string,
    name: string,
    workspaceIds?: (string | null)[]
  ): Promise<MemorySchema | null> {
    if (!workspaceIds || workspaceIds.length === 0) {
      // Default: search in global only (workspaceName will be undefined for global)
      const doc = await MemorySchemaModel.findOne({
        userId: new Types.ObjectId(userId),
        name,
      });
      if (!doc) return null;
      const workspaceName = await this.getWorkspaceName(doc.workspaceId);
      return this.toEntity(doc, workspaceName);
    }

    // Search with workspace precedence
    // Convert string IDs to ObjectIds for MongoDB query
    const workspaceIdObjects = workspaceIds.map((id) =>
      id ? new Types.ObjectId(id) : null
    );

    console.log('[findByName] Query:', { userId, name, workspaceIds, workspaceIdObjects: workspaceIdObjects.map(o => o?.toString() ?? null) });
    const docs = await MemorySchemaModel.find({
      userId: new Types.ObjectId(userId),
      name,
      workspaceId: { $in: workspaceIdObjects },
    }).sort({ workspaceId: -1 });
    console.log('[findByName] Found docs:', docs.length, docs.map(d => ({ id: d._id.toString(), name: d.name, workspaceId: d.workspaceId?.toString() })));

    if (docs.length === 0) return null;

    // Prefer workspace-scoped over global
    const doc = docs.find((d) => d.workspaceId !== null) ?? docs[0]!;
    const workspaceName = await this.getWorkspaceName(doc.workspaceId);
    return this.toEntity(doc, workspaceName);
  }

  async findByUserId(
    userId: string,
    options?: MemorySchemaQueryOptions
  ): Promise<MemorySchema[]> {
    const matchStage: Record<string, unknown> = { userId: new Types.ObjectId(userId) };

    if (options?.workspaceId !== undefined) {
      // Filter by specific workspace (null = global only, "<id>" = workspace only)
      matchStage.workspaceId = options.workspaceId === null
        ? null
        : new Types.ObjectId(options.workspaceId);
    }
    // If workspaceId is undefined, return all (no filter)

    const docs = await MemorySchemaModel.aggregate<MemorySchemaWithWorkspace>([
      { $match: matchStage },
      { $sort: { createdAt: -1 } },
      { $skip: options?.offset ?? 0 },
      { $limit: options?.limit ?? 50 },
      {
        $lookup: {
          from: 'workspaces',
          localField: 'workspaceId',
          foreignField: '_id',
          as: 'workspace',
        },
      },
    ]);

    return docs.map((doc) => {
      const workspaceName = doc.workspace?.[0]?.name;
      return this.toEntity(doc as MemorySchemaDocument, workspaceName);
    });
  }

  async create(data: CreateMemorySchemaDTO): Promise<MemorySchema> {
    const doc = await MemorySchemaModel.create({
      userId: data.userId,
      name: data.name,
      description: data.description ?? null,
      fields: data.fields,
      workspaceId: data.workspaceId ?? null,
    });
    const workspaceName = await this.getWorkspaceName(doc.workspaceId);
    return this.toEntity(doc, workspaceName);
  }

  async update(id: string, data: UpdateMemorySchemaDTO): Promise<MemorySchema | null> {
    const updateData: Record<string, unknown> = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.fields !== undefined) updateData.fields = data.fields;
    if (data.workspaceId !== undefined) updateData.workspaceId = data.workspaceId;

    const doc = await MemorySchemaModel.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    );
    if (!doc) return null;
    const workspaceName = await this.getWorkspaceName(doc.workspaceId);
    return this.toEntity(doc, workspaceName);
  }

  async delete(id: string): Promise<boolean> {
    const result = await MemorySchemaModel.findByIdAndDelete(id);
    return result !== null;
  }

  async deleteByWorkspaceId(workspaceId: string): Promise<number> {
    const result = await MemorySchemaModel.deleteMany({
      workspaceId: new Types.ObjectId(workspaceId),
    });
    return result.deletedCount;
  }

  async nameExists(
    userId: string,
    name: string,
    workspaceId?: string | null,
    excludeId?: string
  ): Promise<boolean> {
    const query: Record<string, unknown> = {
      userId,
      name,
      workspaceId: workspaceId ?? null,
    };
    if (excludeId) {
      query._id = { $ne: excludeId };
    }
    const count = await MemorySchemaModel.countDocuments(query);
    return count > 0;
  }

  async count(userId: string, workspaceId?: string | null): Promise<number> {
    const query: Record<string, unknown> = { userId };
    if (workspaceId !== undefined) {
      query.workspaceId = workspaceId;
    }
    return MemorySchemaModel.countDocuments(query);
  }

  async findAvailableForAgent(userId: string, workspaceId?: string): Promise<MemorySchema[]> {
    // Get all schemas: global + workspace-scoped (if workspace provided)
    const workspaceIdsFilter: (Types.ObjectId | null)[] = [null];
    if (workspaceId) {
      workspaceIdsFilter.push(new Types.ObjectId(workspaceId));
    }

    const docs = await MemorySchemaModel.aggregate<MemorySchemaWithWorkspace>([
      {
        $match: {
          userId: new Types.ObjectId(userId),
          workspaceId: { $in: workspaceIdsFilter },
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
    ]);

    // Build map with workspace precedence
    const schemaMap = new Map<string, MemorySchema>();
    for (const doc of docs) {
      const workspaceName = doc.workspace?.[0]?.name;
      const entity = this.toEntity(doc as MemorySchemaDocument, workspaceName);
      const existing = schemaMap.get(entity.name);
      // Workspace-scoped takes precedence over global
      if (!existing || (entity.workspaceId && !existing.workspaceId)) {
        schemaMap.set(entity.name, entity);
      }
    }

    return Array.from(schemaMap.values());
  }
}
