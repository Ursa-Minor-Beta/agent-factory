export type SessionStatus = 'active' | 'archived';

export interface Session {
  id: string;
  userId: string;
  agentId: string;
  title: string | null;
  status: SessionStatus;
  incognito: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSessionDTO {
  userId: string;
  agentId: string;
  title?: string;
  incognito?: boolean;
}

export interface UpdateSessionDTO {
  title?: string;
  status?: SessionStatus;
}
