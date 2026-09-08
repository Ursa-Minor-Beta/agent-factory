import type { IProviderConfigRepository } from '../domain/interfaces/repositories/IProviderConfigRepository.js';
import type {
  ProviderConfig,
  ProviderType,
  CreateProviderConfigDTO,
  UpdateProviderConfigDTO,
} from '../domain/entities/ProviderConfig.js';
import type { ProviderConfig as ExecutionProviderConfig } from '../engine/nodes/base.js';
import { NotFoundError, ForbiddenError } from '../utils/errors.js';

export class ProviderConfigService {
  constructor(private providerConfigRepo: IProviderConfigRepository) {}

  async getAll(userId: string): Promise<ProviderConfig[]> {
    return this.providerConfigRepo.findByUserId(userId);
  }

  async getById(userId: string, id: string): Promise<ProviderConfig> {
    const config = await this.providerConfigRepo.findById(id);
    if (!config) {
      throw new NotFoundError('Provider config');
    }
    if (config.userId !== userId) {
      throw new ForbiddenError('Access denied');
    }
    return config;
  }

  async getDefault(userId: string, provider: ProviderType): Promise<ProviderConfig | null> {
    return this.providerConfigRepo.findDefault(userId, provider);
  }

  async create(
    userId: string,
    data: Omit<CreateProviderConfigDTO, 'userId'>
  ): Promise<ProviderConfig> {
    return this.providerConfigRepo.create({ ...data, userId });
  }

  async update(
    userId: string,
    id: string,
    data: UpdateProviderConfigDTO
  ): Promise<ProviderConfig> {
    const existing = await this.providerConfigRepo.findById(id);
    if (!existing) {
      throw new NotFoundError('Provider config');
    }
    if (existing.userId !== userId) {
      throw new ForbiddenError('Access denied');
    }

    const updated = await this.providerConfigRepo.update(id, data);
    return updated!;
  }

  async setDefault(userId: string, id: string): Promise<ProviderConfig> {
    const existing = await this.providerConfigRepo.findById(id);
    if (!existing) {
      throw new NotFoundError('Provider config');
    }
    if (existing.userId !== userId) {
      throw new ForbiddenError('Access denied');
    }

    const updated = await this.providerConfigRepo.setDefault(id, userId, existing.provider);
    return updated!;
  }

  async delete(userId: string, id: string): Promise<void> {
    const existing = await this.providerConfigRepo.findById(id);
    if (!existing) {
      throw new NotFoundError('Provider config');
    }
    if (existing.userId !== userId) {
      throw new ForbiddenError('Access denied');
    }

    await this.providerConfigRepo.delete(id);
  }

  /**
   * Build execution provider config from stored defaults
   */
  async buildExecutionConfig(userId: string): Promise<ExecutionProviderConfig> {
    const allConfigs = await this.providerConfigRepo.findByUserId(userId);

    const config: ExecutionProviderConfig = {};

    // Get default configs for each provider type
    for (const providerConfig of allConfigs) {
      if (!providerConfig.isDefault) continue;

      switch (providerConfig.provider) {
        case 'openai':
          if (providerConfig.config.apiKey) {
            config.openai = { apiKey: providerConfig.config.apiKey };
          }
          break;
        case 'anthropic':
          if (providerConfig.config.apiKey) {
            config.anthropic = { apiKey: providerConfig.config.apiKey };
          }
          break;
        case 'ollama':
          config.ollama = {
            baseUrl: providerConfig.config.baseUrl ?? 'http://localhost:11434',
          };
          break;
      }
    }

    return config;
  }
}
