import type { IUserRepository } from '../domain/interfaces/repositories/IUserRepository.js';
import type { IAgentRepository } from '../domain/interfaces/repositories/IAgentRepository.js';
import { hashPassword } from '../utils/crypto.js';
import { config } from '../config/index.js';
import { DEFAULT_AGENT, BASIC_TEST_AGENT, FULL_TEST_AGENT } from '../agents/index.js';

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

    // Check and create Basic Test Agent
    const existingBasic = await this.agentRepo.findSystemAgentByName(BASIC_TEST_AGENT.name);
    if (!existingBasic) {
      await this.agentRepo.createSystemAgent({
        userId: admin.id,
        name: BASIC_TEST_AGENT.name,
        description: BASIC_TEST_AGENT.description,
        nodes: BASIC_TEST_AGENT.nodes,
        edges: BASIC_TEST_AGENT.edges,
        variables: [],
      });
      created.push(BASIC_TEST_AGENT.name);
    }

    // Check and create Full Test Agent
    const existingFull = await this.agentRepo.findSystemAgentByName(FULL_TEST_AGENT.name);
    if (!existingFull) {
      await this.agentRepo.createSystemAgent({
        userId: admin.id,
        name: FULL_TEST_AGENT.name,
        description: FULL_TEST_AGENT.description,
        nodes: FULL_TEST_AGENT.nodes,
        edges: FULL_TEST_AGENT.edges,
        variables: [],
      });
      created.push(FULL_TEST_AGENT.name);
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
      edges: DEFAULT_AGENT.edges,
      variables: [],
    });

    return { created: true, id: defaultAgent.id };
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
      const userAgents = await this.agentRepo.findByUserId(admin.id);
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
