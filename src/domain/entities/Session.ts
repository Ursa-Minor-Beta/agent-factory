export type SessionStatus = 'active' | 'archived';

// Max 4000 characters for agent notes
export const AGENT_NOTES_MAX_LENGTH = 4000;

export interface Session {
  id: string;
  userId: string;
  agentId: string;
  title: string | null;
  status: SessionStatus;
  incognito: boolean;
  agentNotes: string;
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
  agentNotes?: string;
}
