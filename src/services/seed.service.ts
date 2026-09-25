import type { IUserRepository } from '../domain/interfaces/repositories/IUserRepository.js';
import type { IAgentRepository } from '../domain/interfaces/repositories/IAgentRepository.js';
import type { WorkflowNode } from '../domain/entities/Agent.js';
import { hashPassword } from '../utils/crypto.js';
import { config } from '../config/index.js';
import { AGENT_CREATOR } from '../engine/agents/agent-creator.js';
import { DEFAULT_AGENT } from '../engine/agents/default.js';
import { BROWSER_SCREENSHOT } from '../engine/agents/browser-screenshot.js';
import { BROWSER_EXECUTE } from '../engine/agents/browser-execute.js';
import { TEST_STEP_EXECUTOR, TEST_ORCHESTRATOR, TEST_ORCHESTRATOR_NODES } from '../engine/agents/testing/index.js';

export class SeedService {
  constructor(
    private userRepo: IUserRepository,
    private agentRepo: IAgentRepository
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

  /**
   * Find by defaultName or create default agent
   */
  private async findOrCreateDefaultAgent(
    adminId: string,
    defaultName: string,
    name: string,
    description: string,
    nodes: WorkflowNode[]
  ): Promise<string> {
    const existing = await this.agentRepo.findByDefaultName(defaultName);
    if (existing) {
      return existing.id;
    }
    const agent = await this.agentRepo.create({
      userId: adminId,
      name,
      description,
      nodes,
      defaultName,
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

  async seedSystemAgents(): Promise<{ created: string[] }> {
    const admin = await this.getAdminUser();
    if (!admin) {
      return { created: [] };
    }

    // System agents (findBySystemName)
    await this.findOrCreateSystemAgent(admin.id, 'agent-creator', AGENT_CREATOR.name, AGENT_CREATOR.description, AGENT_CREATOR.nodes);
    await this.findOrCreateSystemAgent(admin.id, 'chat-agent', DEFAULT_AGENT.name, DEFAULT_AGENT.description, DEFAULT_AGENT.nodes);

    // Default agents (findByDefaultName)
    await this.findOrCreateDefaultAgent(admin.id, 'browser-screenshot', BROWSER_SCREENSHOT.name, BROWSER_SCREENSHOT.description, BROWSER_SCREENSHOT.nodes);
    await this.findOrCreateDefaultAgent(admin.id, 'browser-execute', BROWSER_EXECUTE.name, BROWSER_EXECUTE.description, BROWSER_EXECUTE.nodes);

    // Test Step Executor
    const testStepExecutorId = await this.findOrCreateDefaultAgent(
      admin.id,
      'test-step-executor',
      TEST_STEP_EXECUTOR.name,
      TEST_STEP_EXECUTOR.description,
      TEST_STEP_EXECUTOR.nodes
    );

    // Test Orchestrator (inject Test Step Executor ID)
    const orchestratorNodes = JSON.parse(
      JSON.stringify(TEST_ORCHESTRATOR_NODES).replace(
        '{{AGENT_ID:Test Step Executor}}',
        testStepExecutorId
      )
    ) as WorkflowNode[];
    await this.findOrCreateDefaultAgent(admin.id, 'test-orchestrator', TEST_ORCHESTRATOR.name, TEST_ORCHESTRATOR.description, orchestratorNodes);

    return { created: [] };
  }

  async updateSystemAgents(): Promise<{ updated: string[]; created: string[] }> {
    const admin = await this.getAdminUser();
    if (!admin) {
      return { updated: [], created: [] };
    }

    const updated: string[] = [];
    const created: string[] = [];

    // Update system agents (by systemName)
    const systemAgents = [
      { systemName: 'agent-creator', name: AGENT_CREATOR.name, desc: AGENT_CREATOR.description, nodes: AGENT_CREATOR.nodes },
      { systemName: 'chat-agent', name: DEFAULT_AGENT.name, desc: DEFAULT_AGENT.description, nodes: DEFAULT_AGENT.nodes },
    ];

    for (const { systemName, name, desc, nodes } of systemAgents) {
      const existing = await this.agentRepo.findBySystemName(systemName);
      if (existing) {
        await this.agentRepo.update(existing.id, { name, description: desc, nodes });
        updated.push(name);
      } else {
        await this.agentRepo.createSystemAgent({ userId: admin.id, name, description: desc, nodes, systemName });
        created.push(name);
      }
    }

    // Get Test Step Executor ID first (create if missing)
    let testStepExecutor = await this.agentRepo.findByDefaultName('test-step-executor');
    if (!testStepExecutor) {
      testStepExecutor = await this.agentRepo.create({
        userId: admin.id,
        name: TEST_STEP_EXECUTOR.name,
        description: TEST_STEP_EXECUTOR.description,
        nodes: TEST_STEP_EXECUTOR.nodes,
        defaultName: 'test-step-executor',
      });
      created.push(TEST_STEP_EXECUTOR.name);
    } else {
      await this.agentRepo.update(testStepExecutor.id, {
        name: TEST_STEP_EXECUTOR.name,
        description: TEST_STEP_EXECUTOR.description,
        nodes: TEST_STEP_EXECUTOR.nodes,
      });
      updated.push(TEST_STEP_EXECUTOR.name);
    }

    // Build orchestrator nodes with resolved ID
    const orchestratorNodes = JSON.parse(
      JSON.stringify(TEST_ORCHESTRATOR_NODES).replace(
        '{{AGENT_ID:Test Step Executor}}',
        testStepExecutor.id
      )
    ) as WorkflowNode[];

    // Update default agents (by defaultName)
    const defaultAgents = [
      { defaultName: 'browser-screenshot', name: BROWSER_SCREENSHOT.name, desc: BROWSER_SCREENSHOT.description, nodes: BROWSER_SCREENSHOT.nodes },
      { defaultName: 'browser-execute', name: BROWSER_EXECUTE.name, desc: BROWSER_EXECUTE.description, nodes: BROWSER_EXECUTE.nodes },
      { defaultName: 'test-orchestrator', name: TEST_ORCHESTRATOR.name, desc: TEST_ORCHESTRATOR.description, nodes: orchestratorNodes },
    ];

    for (const { defaultName, name, desc, nodes } of defaultAgents) {
      const existing = await this.agentRepo.findByDefaultName(defaultName);
      if (existing) {
        await this.agentRepo.update(existing.id, { name, description: desc, nodes });
        updated.push(name);
      } else {
        await this.agentRepo.create({ userId: admin.id, name, description: desc, nodes, defaultName });
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
