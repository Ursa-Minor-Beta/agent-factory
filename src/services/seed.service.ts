import type { IUserRepository } from '../domain/interfaces/repositories/IUserRepository.js';
import type { IAgentRepository } from '../domain/interfaces/repositories/IAgentRepository.js';
import { hashPassword } from '../utils/crypto.js';
import { config } from '../config/index.js';
import { AGENT_CREATOR } from '../engine/agents/agent-creator.js';
import { DEFAULT_AGENT } from '../engine/agents/default.js';


export class SeedService {
  constructor(
    private userRepo: IUserRepository,
    private agentRepo: IAgentRepository
  ) {}

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
    const admin = await this.userRepo.findByEmail(config.admin.email!);
    if (!admin) {
      return { created: [] };
    }

    const created: string[] = [];

    // Check and create Agent Creator
    const existingCreator = await this.agentRepo.findSystemAgentByName(AGENT_CREATOR.name);
    if (!existingCreator) {
      await this.agentRepo.createSystemAgent({
        userId: admin.id,
        name: AGENT_CREATOR.name,
        description: AGENT_CREATOR.description,
        nodes: AGENT_CREATOR.nodes,
      });
      created.push(AGENT_CREATOR.name);
    }

    return { created };
  }

  /**
   * Seed default agent for new users
   */
  async seedDefaultAgent(): Promise<{ created: boolean; id?: string }> {
    const agentCount = await this.agentRepo.count();
    if (agentCount > 0) {
      return { created: false };
    }

    const admin = await this.userRepo.findByEmail(config.admin.email!);
    if (!admin) {
      return { created: false };
    }

    const defaultAgent = await this.agentRepo.create({
      userId: admin.id,
      name: DEFAULT_AGENT.name,
      description: DEFAULT_AGENT.description,
      nodes: DEFAULT_AGENT.nodes,
    });

    return { created: true, id: defaultAgent.id };
  }

  /**
   * Update existing system agents with latest definitions (force reseed)
   */
  async updateSystemAgents(): Promise<{ updated: string[]; created: string[] }> {
    const admin = await this.userRepo.findByEmail(config.admin.email!);
    if (!admin) {
      return { updated: [], created: [] };
    }

    const updated: string[] = [];
    const created: string[] = [];

    // Update/create Agent Creator
    const existingCreator = await this.agentRepo.findSystemAgentByName(AGENT_CREATOR.name);
    if (existingCreator) {
      await this.agentRepo.update(existingCreator.id, {
        description: AGENT_CREATOR.description,
        nodes: AGENT_CREATOR.nodes,
      });
      updated.push(AGENT_CREATOR.name);
    } else {
      await this.agentRepo.createSystemAgent({
        userId: admin.id,
        name: AGENT_CREATOR.name,
        description: AGENT_CREATOR.description,
        nodes: AGENT_CREATOR.nodes,
      });
      created.push(AGENT_CREATOR.name);
    }

    return { updated, created };
  }

  /**
   * Get all agent IDs for logging
   */
  async getAllAgentIds(): Promise<{ name: string; id: string; isSystem: boolean }[]> {
    const systemAgents = await this.agentRepo.findAllSystemAgents();
    const admin = await this.userRepo.findByEmail(config.admin.email!);

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
