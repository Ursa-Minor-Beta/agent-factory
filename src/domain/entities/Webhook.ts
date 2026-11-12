export interface Webhook {
  id: string;
  userId: string;
  agentId: string;
  /** Agent name (populated via aggregation) */
  agentName?: string;
  name: string;
  /** Secret token embedded in the public URL (stored encrypted) */
  token: string;
  enabled: boolean;
  /** JS handler source; null = run agent with { body, headers, query } */
  handler: string | null;
  lastTriggeredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookQueryOptions {
  agentId?: string;
  /** Filter by agent's workspace: undefined = all, null = agents outside workspaces */
  workspaceId?: string | null;
  skip?: number;
  limit?: number;
}

export interface WebhookListResult {
  webhooks: Webhook[];
  total: number;
}

export interface CreateWebhookDTO {
  userId: string;
  agentId: string;
  name: string;
  token: string;
  handler?: string | null;
}

export interface UpdateWebhookDTO {
  name?: string;
  enabled?: boolean;
  handler?: string | null;
  token?: string;
  lastTriggeredAt?: Date;
}
