export type ApiKeyPermission =
  | 'agents:read'
  | 'agents:write'
  | 'agents:run'
  | 'runs:read';

export interface ApiKey {
  id: string;
  userId: string;
  keyHash: string;
  keyPrefix: string;
  name: string;
  permissions: ApiKeyPermission[];
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}

export interface CreateApiKeyDTO {
  userId: string;
  name: string;
  permissions: ApiKeyPermission[];
  expiresAt?: Date | null;
}
