import { ProviderConfigModel, ProviderConfigDocument } from '../models/ProviderConfigModel.js';
import type { IProviderConfigRepository } from '../../../../domain/interfaces/repositories/IProviderConfigRepository.js';
import type {
  ProviderConfig,
  CreateProviderConfigDTO,
  UpdateProviderConfigDTO,
  ProviderType,
} from '../../../../domain/entities/ProviderConfig.js';

export class MongoProviderConfigRepository implements IProviderConfigRepository {
  private toEntity(doc: ProviderConfigDocument): ProviderConfig {
    return {
      id: doc._id.toString(),
      userId: doc.userId.toString(),
      provider: doc.provider,
      name: doc.name,
      isDefault: doc.isDefault,
      config: doc.config,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  async findById(id: string): Promise<ProviderConfig | null> {
    const doc = await ProviderConfigModel.findById(id);
    return doc ? this.toEntity(doc) : null;
  }

  async findByUserId(userId: string): Promise<ProviderConfig[]> {
    const docs = await ProviderConfigModel.find({ userId });
    return docs.map((doc) => this.toEntity(doc));
  }

  async findDefault(userId: string, provider: ProviderType): Promise<ProviderConfig | null> {
    const doc = await ProviderConfigModel.findOne({ userId, provider, isDefault: true });
    return doc ? this.toEntity(doc) : null;
  }

  async create(data: CreateProviderConfigDTO): Promise<ProviderConfig> {
    // If this is the first config for this provider, make it default
    const existingCount = await ProviderConfigModel.countDocuments({
      userId: data.userId,
      provider: data.provider,
    });

    const doc = await ProviderConfigModel.create({
      userId: data.userId,
      provider: data.provider,
      name: data.name,
      isDefault: data.isDefault ?? existingCount === 0,
      config: data.config,
    });
    return this.toEntity(doc);
  }

  async update(id: string, data: UpdateProviderConfigDTO): Promise<ProviderConfig | null> {
    const doc = await ProviderConfigModel.findByIdAndUpdate(
      id,
      { $set: data },
      { new: true }
    );
    return doc ? this.toEntity(doc) : null;
  }

  async setDefault(
    id: string,
    userId: string,
    provider: ProviderType
  ): Promise<ProviderConfig | null> {
    // Unset all other defaults for this provider
    await ProviderConfigModel.updateMany(
      { userId, provider, _id: { $ne: id } },
      { $set: { isDefault: false } }
    );

    // Set this one as default
    const doc = await ProviderConfigModel.findByIdAndUpdate(
      id,
      { $set: { isDefault: true } },
      { new: true }
    );
    return doc ? this.toEntity(doc) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await ProviderConfigModel.findByIdAndDelete(id);
    return result !== null;
  }
}
