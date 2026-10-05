import { Types } from 'mongoose';
import { ProviderConfigModel, ProviderConfigDocument } from '../models/ProviderConfigModel.js';
import { WorkspaceModel } from '../models/WorkspaceModel.js';
import type {
  IProviderConfigRepository,
  ProviderConfigQueryOptions,
} from '../../../../domain/interfaces/repositories/IProviderConfigRepository.js';
import type {
  ProviderConfig,
  CreateProviderConfigDTO,
  UpdateProviderConfigDTO,
  ProviderType,
} from '../../../../domain/entities/ProviderConfig.js';
import { encrypt, decrypt, isEncrypted } from '../../../../utils/crypto.js';

interface ProviderConfigWithWorkspace extends ProviderConfigDocument {
  workspace?: { name: string }[];
}

export class MongoProviderConfigRepository implements IProviderConfigRepository {
  /**
   * Decrypt API key when reading from DB
   */
  private decryptConfig(config: { apiKey?: string; baseUrl?: string }): {
    apiKey?: string;
    baseUrl?: string;
  } {
    if (config.apiKey && isEncrypted(config.apiKey)) {
      return { ...config, apiKey: decrypt(config.apiKey) };
    }
    return config;
  }

  /**
   * Encrypt API key before storing in DB
   */
  private encryptConfig(config: { apiKey?: string; baseUrl?: string }): {
    apiKey?: string;
    baseUrl?: string;
  } {
    if (config.apiKey && !isEncrypted(config.apiKey)) {
      return { ...config, apiKey: encrypt(config.apiKey) };
    }
    return config;
  }

  private toEntity(doc: ProviderConfigDocument, workspaceName?: string): ProviderConfig {
    return {
      id: doc._id.toString(),
      userId: doc.userId.toString(),
      provider: doc.provider,
      name: doc.name,
      isDefault: doc.isDefault,
      config: this.decryptConfig(doc.config),
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

  async findById(id: string): Promise<ProviderConfig | null> {
    const doc = await ProviderConfigModel.findById(id);
    if (!doc) return null;
    const workspaceName = await this.getWorkspaceName(doc.workspaceId);
    return this.toEntity(doc, workspaceName);
  }

  async findByUserId(userId: string, options?: ProviderConfigQueryOptions): Promise<ProviderConfig[]> {
    const matchStage: Record<string, unknown> = { userId: new Types.ObjectId(userId) };

    if (options?.workspaceId !== undefined) {
      // Filter by specific workspace (null = global only, "<id>" = workspace only)
      matchStage.workspaceId = options.workspaceId === null
        ? null
        : new Types.ObjectId(options.workspaceId);
    }
    // If workspaceId is undefined, return all (no filter)

    const docs = await ProviderConfigModel.aggregate<ProviderConfigWithWorkspace>([
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
      return this.toEntity(doc as ProviderConfigDocument, workspaceName);
    });
  }

  async findDefault(
    userId: string,
    provider: ProviderType,
    workspaceIds?: (string | null)[]
  ): Promise<ProviderConfig | null> {
    const searchWorkspaces = workspaceIds ?? [null];

    // Search with workspace precedence
    const docs = await ProviderConfigModel.find({
      userId,
      provider,
      isDefault: true,
      workspaceId: { $in: searchWorkspaces },
    }).sort({ workspaceId: -1 });

    if (docs.length === 0) return null;

    // Prefer workspace-scoped over global
    const doc = docs.find((d) => d.workspaceId !== null) ?? docs[0]!;
    const workspaceName = await this.getWorkspaceName(doc.workspaceId);
    return this.toEntity(doc, workspaceName);
  }

  async create(data: CreateProviderConfigDTO): Promise<ProviderConfig> {
    // If this is the first config for this provider in this scope, make it default
    const existingCount = await ProviderConfigModel.countDocuments({
      userId: data.userId,
      provider: data.provider,
      workspaceId: data.workspaceId ?? null,
    });

    const doc = await ProviderConfigModel.create({
      userId: data.userId,
      provider: data.provider,
      name: data.name,
      isDefault: data.isDefault ?? existingCount === 0,
      config: this.encryptConfig(data.config),
      workspaceId: data.workspaceId ?? null,
    });
    const workspaceName = await this.getWorkspaceName(doc.workspaceId);
    return this.toEntity(doc, workspaceName);
  }

  async update(id: string, data: UpdateProviderConfigDTO): Promise<ProviderConfig | null> {
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.isDefault !== undefined) updateData.isDefault = data.isDefault;
    if (data.config !== undefined) updateData.config = this.encryptConfig(data.config);
    if (data.workspaceId !== undefined) updateData.workspaceId = data.workspaceId;

    const doc = await ProviderConfigModel.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    );
    if (!doc) return null;
    const workspaceName = await this.getWorkspaceName(doc.workspaceId);
    return this.toEntity(doc, workspaceName);
  }

  async setDefault(
    id: string,
    userId: string,
    provider: ProviderType
  ): Promise<ProviderConfig | null> {
    // Get the config to find its workspace
    const config = await ProviderConfigModel.findById(id);
    if (!config) return null;

    // Unset all other defaults for this provider in the same scope
    await ProviderConfigModel.updateMany(
      {
        userId,
        provider,
        workspaceId: config.workspaceId,
        _id: { $ne: id },
      },
      { $set: { isDefault: false } }
    );

    // Set this one as default
    const doc = await ProviderConfigModel.findByIdAndUpdate(
      id,
      { $set: { isDefault: true } },
      { new: true }
    );
    if (!doc) return null;
    const workspaceName = await this.getWorkspaceName(doc.workspaceId);
    return this.toEntity(doc, workspaceName);
  }

  async delete(id: string): Promise<boolean> {
    const result = await ProviderConfigModel.findByIdAndDelete(id);
    return result !== null;
  }

  async deleteByWorkspaceId(workspaceId: string): Promise<number> {
    const result = await ProviderConfigModel.deleteMany({
      workspaceId: new Types.ObjectId(workspaceId),
    });
    return result.deletedCount;
  }

  async findAvailableForAgent(userId: string, workspaceId?: string): Promise<ProviderConfig[]> {
    // Get all configs: global + workspace-scoped (if workspace provided)
    const workspaceIdsFilter: (Types.ObjectId | null)[] = [null];
    if (workspaceId) {
      workspaceIdsFilter.push(new Types.ObjectId(workspaceId));
    }

    const docs = await ProviderConfigModel.aggregate<ProviderConfigWithWorkspace>([
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

    // Build map with workspace precedence (key: provider type)
    const configMap = new Map<string, ProviderConfig>();
    for (const doc of docs) {
      const workspaceName = doc.workspace?.[0]?.name;
      const entity = this.toEntity(doc as ProviderConfigDocument, workspaceName);
      // Use provider + isDefault as key to keep track of defaults
      const key = `${entity.provider}:${entity.isDefault}`;
      const existing = configMap.get(key);
      // Workspace-scoped takes precedence over global
      if (!existing || (entity.workspaceId && !existing.workspaceId)) {
        configMap.set(key, entity);
      }
    }

    return Array.from(configMap.values());
  }
}
