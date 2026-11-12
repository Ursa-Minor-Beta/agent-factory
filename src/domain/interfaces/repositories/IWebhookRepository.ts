import type {
  Webhook,
  CreateWebhookDTO,
  UpdateWebhookDTO,
  WebhookQueryOptions,
  WebhookListResult,
} from '../../entities/Webhook.js';

export interface IWebhookRepository {
  findById(id: string): Promise<Webhook | null>;
  findByUserId(userId: string, options?: WebhookQueryOptions): Promise<WebhookListResult>;
  create(data: CreateWebhookDTO): Promise<Webhook>;
  update(id: string, data: UpdateWebhookDTO): Promise<Webhook | null>;
  /**
   * Delete webhooks by id, agentId or userId
   * @returns Number of deleted webhooks
   */
  delete(options: { id?: string; agentId?: string; userId?: string }): Promise<number>;
}
