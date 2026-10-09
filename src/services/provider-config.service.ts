import type {
  IProviderConfigRepository,
  ProviderConfigQueryOptions,
} from '../domain/interfaces/repositories/IProviderConfigRepository.js';
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

  async getAll(userId: string, options?: ProviderConfigQueryOptions): Promise<ProviderConfig[]> {
    return this.providerConfigRepo.findByUserId(userId, options);
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

  async getDefault(
    userId: string,
    provider: ProviderType,
    workspaceId?: string
  ): Promise<ProviderConfig | null> {
    // Search in workspace first, then global
    const workspaceIds: (string | null)[] = workspaceId ? [workspaceId, null] : [null];
    return this.providerConfigRepo.findDefault(userId, provider, workspaceIds);
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
   * @param workspaceId - If provided, includes workspace-scoped configs (which take precedence)
   */
  async buildExecutionConfig(userId: string, workspaceId?: string): Promise<ExecutionProviderConfig> {
    const allConfigs = await this.providerConfigRepo.findAvailableForAgent(userId, workspaceId);

    const config: ExecutionProviderConfig = {};

    // Get default configs for each provider type (workspace-scoped already takes precedence)
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
