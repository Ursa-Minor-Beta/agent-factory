import type { IUserRepository } from '../domain/interfaces/repositories/IUserRepository.js';
import type { IAgentRepository } from '../domain/interfaces/repositories/IAgentRepository.js';
import { hashPassword } from '../utils/crypto.js';
import { config } from '../config/index.js';
import { AGENT_CREATOR } from '../engine/agents/agent-creator.js';
import { DEFAULT_AGENT } from '../engine/agents/default.js';

/**
 * System agents available to all users
 */
const SYSTEM_AGENTS = [AGENT_CREATOR, DEFAULT_AGENT] as const;

export class SeedService {
  constructor(
    private userRepo: IUserRepository,
    private agentRepo: IAgentRepository
  ) {}

  /**
   * Get admin user (helper to reduce duplication)
   */
  private async getAdminUser() {
    return this.userRepo.findByEmail(config.admin.email!);
  }

  /**
   * Seed or update a system agent (helper to reduce duplication)
   */
  private async seedOrUpdateSystemAgent(
    adminId: string,
    agentDef: typeof AGENT_CREATOR | typeof DEFAULT_AGENT,
    forceUpdate: boolean
  ): Promise<'created' | 'updated' | 'skipped'> {
    const existing = await this.agentRepo.findSystemAgentByName(agentDef.name);

    if (existing) {
      if (forceUpdate) {
        await this.agentRepo.update(existing.id, {
          description: agentDef.description,
          nodes: agentDef.nodes,
        });
        return 'updated';
      }
      return 'skipped';
    }

    // Create new system agent
    await this.agentRepo.createSystemAgent({
      userId: adminId,
      name: agentDef.name,
      description: agentDef.description,
      nodes: agentDef.nodes,
    });
    return 'created';
  }

  async seedAdmin(): Promise<{ created: boolean; email: string }> {
    // Check if any users exist
    const userCount = await this.userRepo.count();

    if (userCount > 0) {
      return { created: false, email: config.admin.email! };
    }

    // Create admin user
    const passwordHash = await hashPassword(config.admin.password!);

    await this.userRepo.create({
      email: config.admin.email!,
      password: config.admin.password!,
      name: config.admin.name,
      role: 'admin',
      passwordHash,
    });

    return { created: true, email: config.admin.email! };
  }

  /**
   * Seed system agents if they don't exist (idempotent)
   */
  async seedSystemAgents(): Promise<{ created: string[] }> {
    const admin = await this.getAdminUser();
    if (!admin) {
      return { created: [] };
    }

    const created: string[] = [];

    // Seed all system agents
    for (const agentDef of SYSTEM_AGENTS) {
      const result = await this.seedOrUpdateSystemAgent(admin.id, agentDef, false);
      if (result === 'created') {
        created.push(agentDef.name);
      }
    }

    return { created };
  }

  /**
   * Update existing system agents with latest definitions (force reseed/upsert)
   */
  async updateSystemAgents(): Promise<{ updated: string[]; created: string[] }> {
    const admin = await this.getAdminUser();
    if (!admin) {
      return { updated: [], created: [] };
    }

    const updated: string[] = [];
    const created: string[] = [];

    // Update/create all system agents
    for (const agentDef of SYSTEM_AGENTS) {
      const result = await this.seedOrUpdateSystemAgent(admin.id, agentDef, true);
      if (result === 'updated') {
        updated.push(agentDef.name);
      } else if (result === 'created') {
        created.push(agentDef.name);
      }
    }

    return { updated, created };
  }

  /**
   * Get all agent IDs for logging
   */
  async getAllAgentIds(): Promise<{ name: string; id: string; isSystem: boolean }[]> {
    const systemAgents = await this.agentRepo.findAllSystemAgents();
    const admin = await this.getAdminUser();

    const result: { name: string; id: string; isSystem: boolean }[] = [];

    // Add default agent if exists
    if (admin) {
      const { agents: userAgents } = await this.agentRepo.findByUserId(admin.id);
      for (const agent of userAgents) {
        result.push({ name: agent.name, id: agent.id, isSystem: false });
      }
    }

    // Add system agents
    for (const agent of systemAgents) {
      result.push({ name: agent.name, id: agent.id, isSystem: true });
    }

    return result;
  }
}
