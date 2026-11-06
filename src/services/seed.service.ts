import type { IUserRepository } from '../domain/interfaces/repositories/IUserRepository.js';
import type { IAgentRepository } from '../domain/interfaces/repositories/IAgentRepository.js';
import type { IWorkspaceRepository } from '../domain/interfaces/repositories/IWorkspaceRepository.js';
import type { WorkflowNode } from '../domain/entities/Agent.js';
import { hashPassword } from '../utils/crypto.js';
import { config } from '../config/index.js';
import { AGENT_CREATOR } from '../engine/agents/agent-creator.js';
import { CHAT_AGENT } from '../engine/agents/chat.js';
import { AGENT_BUILDER } from '../engine/agents/agent-builder.js';

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
   * Find by systemName or create system agent (new ones are global, existing keep their workspace)
   */
  private async findOrCreateSystemAgent(
    adminId: string,
    systemName: string,
    name: string,
    description: string,
    nodes: WorkflowNode[]
  ): Promise<string> {
    const existing = await this.agentRepo.findBySystemName(systemName);
    if (existing) {
      return existing.id;
    }
    const agent = await this.agentRepo.createSystemAgent({
      userId: adminId,
      name,
      description,
      nodes,
      systemName,
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
    await this.seedWorkspaces();

    // System agents → global (no workspace)
    await this.findOrCreateSystemAgent(admin.id, 'agent-creator', AGENT_CREATOR.name, AGENT_CREATOR.description, AGENT_CREATOR.nodes);
    await this.findOrCreateSystemAgent(admin.id, 'chat-agent', CHAT_AGENT.name, CHAT_AGENT.description, CHAT_AGENT.nodes);
    await this.findOrCreateSystemAgent(admin.id, 'agent-builder', AGENT_BUILDER.name, AGENT_BUILDER.description, AGENT_BUILDER.nodes);

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
    await this.seedWorkspaces();

    // Update system agents (by systemName); keep existing workspace, new ones → global
    const systemAgents = [
      { systemName: 'agent-creator', name: AGENT_CREATOR.name, desc: AGENT_CREATOR.description, nodes: AGENT_CREATOR.nodes },
      { systemName: 'chat-agent', name: CHAT_AGENT.name, desc: CHAT_AGENT.description, nodes: CHAT_AGENT.nodes },
      { systemName: 'agent-builder', name: AGENT_BUILDER.name, desc: AGENT_BUILDER.description, nodes: AGENT_BUILDER.nodes },
    ];

    for (const { systemName, name, desc, nodes } of systemAgents) {
      const existing = await this.agentRepo.findBySystemName(systemName);
      if (existing) {
        const mergedNodes = this.keepLlmSettings(nodes, existing.nodes);
        await this.agentRepo.update(existing.id, { name, description: desc, nodes: mergedNodes });
        updated.push(name);
      }
      else {
        await this.agentRepo.createSystemAgent({ userId: admin.id, name, description: desc, nodes, systemName });
        created.push(name);
      }
    }

    return { updated, created };
  }

  /**
   * Preserve provider/model chosen by the admin on existing LLM nodes (matched by node id)
   */
  private keepLlmSettings(nodes: WorkflowNode[], existingNodes: WorkflowNode[]): WorkflowNode[] {
    const existingById = new Map(existingNodes.map((n) => [n.id, n]));
    return nodes.map((node) => {
      const prev = existingById.get(node.id);
      if (node.type !== 'llm' || prev?.type !== 'llm') return node;
      const { provider, model } = prev.data as { provider?: unknown; model?: unknown };
      return {
        ...node,
        data: {
          ...node.data,
          ...(provider !== undefined && { provider }),
          ...(model !== undefined && { model }),
        },
      };
    });
  }

  async getAllAgentIds():Promise<{ name: string; id: string; systemName?: string }[]> {
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
