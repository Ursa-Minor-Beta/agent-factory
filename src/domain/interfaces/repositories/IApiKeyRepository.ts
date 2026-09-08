import { ApiKey, CreateApiKeyDTO } from '../../entities/ApiKey.js';

export interface IApiKeyRepository {
  findById(id: string): Promise<ApiKey | null>;
  findByKeyHash(keyHash: string): Promise<ApiKey | null>;
  findByUserId(userId: string): Promise<ApiKey[]>;
  create(data: CreateApiKeyDTO & { keyHash: string; keyPrefix: string }): Promise<ApiKey>;
  updateLastUsed(id: string): Promise<void>;
  delete(id: string): Promise<boolean>;
}
