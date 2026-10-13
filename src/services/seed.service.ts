import type { IUserRepository } from '../domain/interfaces/repositories/IUserRepository.js';
import type { IAgentRepository } from '../domain/interfaces/repositories/IAgentRepository.js';
import type { IWorkspaceRepository } from '../domain/interfaces/repositories/IWorkspaceRepository.js';
import type { WorkflowNode } from '../domain/entities/Agent.js';
import { hashPassword } from '../utils/crypto.js';
import { config } from '../config/index.js';
import { AGENT_CREATOR } from '../engine/agents/agent-creator.js';
import { CHAT_AGENT } from '../engine/agents/chat.js';

export class SeedService {
  constructor(
    private userRepo: IUserRepository,
    private agentRepo: IAgentRepository,
    private workspaceRepo: IWorkspaceRepository
  ) {}

  private async getAdminUser() {
    return this.userRepo.findByEmail(config.admin.email!);
  }

  /**
   * Find by systemName or create system agent
   */
  private async findOrCreateSystemAgent(
    adminId: string,
    systemName: string,
    name: string,
    description: string,
    nodes: WorkflowNode[],
    workspaceId?: string
  ): Promise<string> {
    const existing = await this.agentRepo.findBySystemName(systemName);
    if (existing) {
      // Update workspace if provided
      if (workspaceId && existing.workspaceId !== workspaceId) {
        await this.agentRepo.update(existing.id, { workspaceId });
      }
      return existing.id;
    }
    const agent = await this.agentRepo.createSystemAgent({
      userId: adminId,
      name,
      description,
      nodes,
      systemName,
      workspaceId,
    });
    return agent.id;
  }

  async seedAdmin(): Promise<{ created: boolean; email: string }> {
    const userCount = await this.userRepo.count();
    if (userCount > 0) {
      return { created: false, email: config.admin.email! };
    }
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

  async seedWorkspaces(): Promise<{ startId: string }> {
    const admin = await this.getAdminUser();
    if (!admin) {
      throw new Error('Admin user not found - cannot seed workspaces');
    }

    // Upsert "Start" workspace
    let startWorkspace = await this.workspaceRepo.findByDefaultName('start');
    if (!startWorkspace) {
      startWorkspace = await this.workspaceRepo.create({
        userId: admin.id,
        name: 'Start',
        description: 'Default workspace for system and starter agents',
        defaultName: 'start',
      });
    }

    return { startId: startWorkspace.id };
  }

  async seedSystemAgents(): Promise<{ created: string[] }> {
    const admin = await this.getAdminUser();
    if (!admin) {
      return { created: [] };
    }

    // Seed workspaces first
    const { startId } = await this.seedWorkspaces();

    // System agents → Start workspace
    await this.findOrCreateSystemAgent(admin.id, 'agent-creator', AGENT_CREATOR.name, AGENT_CREATOR.description, AGENT_CREATOR.nodes, startId);
    await this.findOrCreateSystemAgent(admin.id, 'chat-agent', CHAT_AGENT.name, CHAT_AGENT.description, CHAT_AGENT.nodes, startId);

    return { created: [] };
  }

  async updateSystemAgents(): Promise<{ updated: string[]; created: string[] }> {
    const admin = await this.getAdminUser();
    if (!admin) {
      return { updated: [], created: [] };
    }

    const updated: string[] = [];
    const created: string[] = [];

    // Seed workspaces first
    const { startId } = await this.seedWorkspaces();

    // Update system agents (by systemName) → Start workspace
    const systemAgents = [
      { systemName: 'agent-creator', name: AGENT_CREATOR.name, desc: AGENT_CREATOR.description, nodes: AGENT_CREATOR.nodes },
      { systemName: 'chat-agent', name: CHAT_AGENT.name, desc: CHAT_AGENT.description, nodes: CHAT_AGENT.nodes },
    ];

    for (const { systemName, name, desc, nodes } of systemAgents) {
      const existing = await this.agentRepo.findBySystemName(systemName);
      if (existing) {
        await this.agentRepo.update(existing.id, { name, description: desc, nodes, workspaceId: startId });
        updated.push(name);
      } else {
        await this.agentRepo.createSystemAgent({ userId: admin.id, name, description: desc, nodes, systemName, workspaceId: startId });
        created.push(name);
      }
    }

    return { updated, created };
  }

  async getAllAgentIds(): Promise<{ name: string; id: string; systemName?: string }[]> {
    const systemAgents = await this.agentRepo.findAllSystemAgents();
    const admin = await this.getAdminUser();
    const result: { name: string; id: string; systemName?: string }[] = [];

    if (admin) {
      const { agents: userAgents } = await this.agentRepo.findByUserId(admin.id, { limit: 1000 });
      for (const agent of userAgents) {
        result.push({ name: agent.name, id: agent.id, systemName: agent.systemName });
      }
    }

    for (const agent of systemAgents) {
      result.push({ name: agent.name, id: agent.id, systemName: agent.systemName });
    }

    return result;
  }
}
