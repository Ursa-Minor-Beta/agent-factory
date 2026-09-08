import {
  ProviderConfig,
  CreateProviderConfigDTO,
  UpdateProviderConfigDTO,
  ProviderType,
} from '../../entities/ProviderConfig.js';

export interface IProviderConfigRepository {
  findById(id: string): Promise<ProviderConfig | null>;
  findByUserId(userId: string): Promise<ProviderConfig[]>;
  findDefault(userId: string, provider: ProviderType): Promise<ProviderConfig | null>;
  create(data: CreateProviderConfigDTO): Promise<ProviderConfig>;
  update(id: string, data: UpdateProviderConfigDTO): Promise<ProviderConfig | null>;
  setDefault(id: string, userId: string, provider: ProviderType): Promise<ProviderConfig | null>;
  delete(id: string): Promise<boolean>;
}
