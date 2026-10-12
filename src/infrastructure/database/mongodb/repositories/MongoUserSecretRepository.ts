import { Types } from 'mongoose';
import { UserSecretModel, UserSecretDocument } from '../models/UserSecretModel.js';
import { WorkspaceModel } from '../models/WorkspaceModel.js';
import type {
  IUserSecretRepository,
  UserSecretQueryOptions,
} from '../../../../domain/interfaces/repositories/IUserSecretRepository.js';
import type {
  UserSecret,
  CreateUserSecretDTO,
  UpdateUserSecretDTO,
} from '../../../../domain/entities/UserSecret.js';
import { encrypt, decrypt } from '../../../../utils/crypto.js';

interface UserSecretWithWorkspace extends UserSecretDocument {
  workspace?: { name: string }[];
}

export class MongoUserSecretRepository implements IUserSecretRepository {
  private toEntity(doc: UserSecretDocument, workspaceName?: string): UserSecret {
    return {
      id: doc._id.toString(),
      userId: doc.userId.toString(),
      name: doc.name,
      value: decrypt(doc.encryptedValue),
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

  async findById(id: string): Promise<UserSecret | null> {
    const doc = await UserSecretModel.findById(id);
    if (!doc) return null;
    const workspaceName = await this.getWorkspaceName(doc.workspaceId);
    return this.toEntity(doc, workspaceName);
  }

  async findByUserId(userId: string, options?: UserSecretQueryOptions): Promise<UserSecret[]> {
    const matchStage: Record<string, unknown> = { userId: new Types.ObjectId(userId) };

    if (options?.workspaceId !== undefined) {
      // Filter by specific workspace (null = global only, "<id>" = workspace only)
      matchStage.workspaceId = options.workspaceId === null
        ? null
        : new Types.ObjectId(options.workspaceId);
    }
    // If workspaceId is undefined, return all (no filter)

    const docs = await UserSecretModel.aggregate<UserSecretWithWorkspace>([
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
      return this.toEntity(doc as UserSecretDocument, workspaceName);
    });
  }

  async findByName(
    userId: string,
    name: string,
    workspaceIds?: (string | null)[]
  ): Promise<UserSecret | null> {
    if (!workspaceIds || workspaceIds.length === 0) {
      // Default: search in global only
      const doc = await UserSecretModel.findOne({ userId, name, workspaceId: null });
      return doc ? this.toEntity(doc) : null;
    }

    // Search with workspace precedence: workspace-scoped first, then global
    // Sort by workspaceId descending so workspace-scoped (non-null) comes first
    const docs = await UserSecretModel.find({
      userId,
      name,
      workspaceId: { $in: workspaceIds },
    }).sort({ workspaceId: -1 });

    if (docs.length === 0) return null;

    const doc = docs[0]!;
    const workspaceName = await this.getWorkspaceName(doc.workspaceId);
    return this.toEntity(doc, workspaceName);
  }

  async create(data: CreateUserSecretDTO): Promise<UserSecret> {
    const doc = await UserSecretModel.create({
      userId: data.userId,
      name: data.name,
      encryptedValue: encrypt(data.value),
      description: data.description,
      workspaceId: data.workspaceId ?? null,
    });
    const workspaceName = await this.getWorkspaceName(doc.workspaceId);
    return this.toEntity(doc, workspaceName);
  }

  async update(id: string, data: UpdateUserSecretDTO): Promise<UserSecret | null> {
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.value !== undefined) updateData.encryptedValue = encrypt(data.value);
    if (data.workspaceId !== undefined) updateData.workspaceId = data.workspaceId;

    const doc = await UserSecretModel.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    );
    if (!doc) return null;
    const workspaceName = await this.getWorkspaceName(doc.workspaceId);
    return this.toEntity(doc, workspaceName);
  }

  async delete(id: string): Promise<boolean> {
    const result = await UserSecretModel.findByIdAndDelete(id);
    return result !== null;
  }

  async deleteByWorkspaceId(workspaceId: string): Promise<number> {
    const result = await UserSecretModel.deleteMany({
      workspaceId: new Types.ObjectId(workspaceId),
    });
    return result.deletedCount;
  }

  async findAvailableForAgent(userId: string, workspaceId?: string): Promise<UserSecret[]> {
    // Get all secrets: global + workspace-scoped (if workspace provided)
    const workspaceIdsFilter: (Types.ObjectId | null)[] = [null];
    if (workspaceId) {
      workspaceIdsFilter.push(new Types.ObjectId(workspaceId));
    }

    const docs = await UserSecretModel.aggregate<UserSecretWithWorkspace>([
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
    const secretMap = new Map<string, UserSecret>();
    for (const doc of docs) {
      const workspaceName = doc.workspace?.[0]?.name;
      const entity = this.toEntity(doc as UserSecretDocument, workspaceName);
      const existing = secretMap.get(entity.name);
      // Workspace-scoped takes precedence over global
      if (!existing || (entity.workspaceId && !existing.workspaceId)) {
        secretMap.set(entity.name, entity);
      }
    }

    return Array.from(secretMap.values());
  }

  async count(userId: string, workspaceId?: string | null): Promise<number> {
    const query: Record<string, unknown> = { userId: new Types.ObjectId(userId) };
    if (workspaceId !== undefined) {
      query.workspaceId = workspaceId === null ? null : new Types.ObjectId(workspaceId);
    }
    return UserSecretModel.countDocuments(query);
  }
}
