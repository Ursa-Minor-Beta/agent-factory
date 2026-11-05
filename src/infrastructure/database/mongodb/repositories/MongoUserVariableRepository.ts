import { Types } from 'mongoose';
import { UserVariableModel, UserVariableDocument } from '../models/UserVariableModel.js';
import { WorkspaceModel } from '../models/WorkspaceModel.js';
import type {
  IUserVariableRepository,
  UserVariableQueryOptions,
} from '../../../../domain/interfaces/repositories/IUserVariableRepository.js';
import type {
  UserVariable,
  CreateUserVariableDTO,
  UpdateUserVariableDTO,
} from '../../../../domain/entities/UserVariable.js';

interface UserVariableWithWorkspace extends UserVariableDocument {
  workspace?: { name: string }[];
}

export class MongoUserVariableRepository implements IUserVariableRepository {
  private toEntity(doc: UserVariableDocument, workspaceName?: string): UserVariable {
    return {
      id: doc._id.toString(),
      userId: doc.userId.toString(),
      name: doc.name,
      value: doc.value,
      description: doc.description,
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

  async findById(id: string): Promise<UserVariable | null> {
    const doc = await UserVariableModel.findById(id);
    if (!doc) return null;
    const workspaceName = await this.getWorkspaceName(doc.workspaceId);
    return this.toEntity(doc, workspaceName);
  }

  async findByUserId(userId: string, options?: UserVariableQueryOptions): Promise<UserVariable[]> {
    const matchStage: Record<string, unknown> = { userId: new Types.ObjectId(userId) };

    if (options?.workspaceId !== undefined) {
      // Filter by specific workspace (null = global only, "<id>" = workspace only)
      matchStage.workspaceId = options.workspaceId === null
        ? null
        : new Types.ObjectId(options.workspaceId);
    }
    // If workspaceId is undefined, return all (no filter)

    const docs = await UserVariableModel.aggregate<UserVariableWithWorkspace>([
      { $match: matchStage },
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
      return this.toEntity(doc as UserVariableDocument, workspaceName);
    });
  }

  async findByName(
    userId: string,
    name: string,
    workspaceIds?: (string | null)[]
  ): Promise<UserVariable | null> {
    if (!workspaceIds || workspaceIds.length === 0) {
      // Default: search in global only
      const doc = await UserVariableModel.findOne({ userId, name, workspaceId: null });
      return doc ? this.toEntity(doc) : null;
    }

    // Search with workspace precedence: workspace-scoped first, then global
    // Sort by workspaceId descending so workspace-scoped (non-null) comes first
    const docs = await UserVariableModel.find({
      userId,
      name,
      workspaceId: { $in: workspaceIds },
    }).sort({ workspaceId: -1 });

    if (docs.length === 0) return null;

    const doc = docs[0]!;
    const workspaceName = await this.getWorkspaceName(doc.workspaceId);
    return this.toEntity(doc, workspaceName);
  }

  async create(data: CreateUserVariableDTO): Promise<UserVariable> {
    const doc = await UserVariableModel.create({
      userId: data.userId,
      name: data.name,
      value: data.value,
      description: data.description,
      workspaceId: data.workspaceId ?? null,
    });
    const workspaceName = await this.getWorkspaceName(doc.workspaceId);
    return this.toEntity(doc, workspaceName);
  }

  async update(id: string, data: UpdateUserVariableDTO): Promise<UserVariable | null> {
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.value !== undefined) updateData.value = data.value;
    if (data.workspaceId !== undefined) updateData.workspaceId = data.workspaceId;

    const doc = await UserVariableModel.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    );
    if (!doc) return null;
    const workspaceName = await this.getWorkspaceName(doc.workspaceId);
    return this.toEntity(doc, workspaceName);
  }

  async delete(options: { id?: string; workspaceId?: string; userId?: string }): Promise<number> {
    const query: Record<string, unknown> = {};
    if (options.id) query._id = options.id;
    if (options.workspaceId) query.workspaceId = new Types.ObjectId(options.workspaceId);
    if (options.userId) query.userId = new Types.ObjectId(options.userId);
    const result = await UserVariableModel.deleteMany(query);
    return result.deletedCount;
  }

  async findAvailableForAgent(userId: string, workspaceId?: string): Promise<UserVariable[]> {
    // Get all variables: global + workspace-scoped (if workspace provided)
    const workspaceIdsFilter: (Types.ObjectId | null)[] = [null];
    if (workspaceId) {
      workspaceIdsFilter.push(new Types.ObjectId(workspaceId));
    }

    const docs = await UserVariableModel.aggregate<UserVariableWithWorkspace>([
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
    const variableMap = new Map<string, UserVariable>();
    for (const doc of docs) {
      const workspaceName = doc.workspace?.[0]?.name;
      const entity = this.toEntity(doc as UserVariableDocument, workspaceName);
      const existing = variableMap.get(entity.name);
      // Workspace-scoped takes precedence over global
      if (!existing || (entity.workspaceId && !existing.workspaceId)) {
        variableMap.set(entity.name, entity);
      }
    }

    return Array.from(variableMap.values());
  }

  async count(userId: string, workspaceId?: string | null): Promise<number> {
    const query: Record<string, unknown> = { userId: new Types.ObjectId(userId) };
    if (workspaceId !== undefined) {
      query.workspaceId = workspaceId === null ? null : new Types.ObjectId(workspaceId);
    }
    return UserVariableModel.countDocuments(query);
  }
}
