/**
 * A login on one device. Refresh tokens carry its id; deleting it signs that device out.
 * (Not to be confused with chat `Session`.)
 */
export interface AuthSession {
  id: string;
  userId: string;
  userAgent: string | null;
  lastUsedAt: Date;
  expiresAt: Date;
  createdAt: Date;
}

export interface CreateAuthSessionDTO {
  userId: string;
  userAgent?: string | null;
  expiresAt: Date;
}
