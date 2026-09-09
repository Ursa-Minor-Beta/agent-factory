import type { IUserRepository } from '../domain/interfaces/repositories/IUserRepository.js';
import type { IAgentRepository } from '../domain/interfaces/repositories/IAgentRepository.js';
import type { WorkflowNode } from '../domain/entities/Agent.js';
import { hashPassword } from '../utils/crypto.js';
import { config } from '../config/index.js';
import { AGENT_CREATOR } from '../engine/agents/agent-creator.js';
import { DEFAULT_AGENT } from '../engine/agents/default.js';
import { BASIC_TEST_AGENT } from '../engine/agents/test-basic.js';
import { FULL_TEST_AGENT } from '../engine/agents/test-full.js';
import { MATH_SKILL_AGENT } from '../engine/agents/test-skill-math.js';
import { SKILLS_TEST_AGENT } from '../engine/agents/test-skills.js';


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

    // Check and create Math Skill Agent (must be created before Skills Test Agent)
    let mathSkillAgent = await this.agentRepo.findSystemAgentByName(MATH_SKILL_AGENT.name);
    if (!mathSkillAgent) {
      mathSkillAgent = await this.agentRepo.createSystemAgent({
        userId: admin.id,
        name: MATH_SKILL_AGENT.name,
        description: MATH_SKILL_AGENT.description,
        nodes: MATH_SKILL_AGENT.nodes,
        edges: MATH_SKILL_AGENT.edges,
        variables: [],
      });
      created.push(MATH_SKILL_AGENT.name);
    }

    // Check and create Skills Test Agent (with resolved tool agentIds)
    const existingSkills = await this.agentRepo.findSystemAgentByName(SKILLS_TEST_AGENT.name);
    if (!existingSkills) {
      // Inject the actual Math Skill agent ID into the LLM node's tools
      const resolvedNodes = this.resolveToolAgentIds(
        SKILLS_TEST_AGENT.nodes,
        { '{{MATH_SKILL_AGENT_ID}}': mathSkillAgent.id }
      );

      await this.agentRepo.createSystemAgent({
        userId: admin.id,
        name: SKILLS_TEST_AGENT.name,
        description: SKILLS_TEST_AGENT.description,
        nodes: resolvedNodes,
        edges: SKILLS_TEST_AGENT.edges,
        variables: [],
      });
      created.push(SKILLS_TEST_AGENT.name);
    }

    // Check and create Agent Creator
    const existingCreator = await this.agentRepo.findSystemAgentByName(AGENT_CREATOR.name);
    if (!existingCreator) {
      await this.agentRepo.createSystemAgent({
        userId: admin.id,
        name: AGENT_CREATOR.name,
        description: AGENT_CREATOR.description,
        nodes: AGENT_CREATOR.nodes,
        edges: AGENT_CREATOR.edges,
        variables: [],
      });
      created.push(AGENT_CREATOR.name);
    }

    return { created };
  }

  /**
   * Replace placeholder agentIds in tool definitions with actual IDs
   */
  private resolveToolAgentIds(
    nodes: WorkflowNode[],
    idMap: Record<string, string>
  ): WorkflowNode[] {
    return nodes.map((node) => {
      if (node.type !== 'llm' || !node.data.tools) {
        return node;
      }

      const resolvedTools = (node.data.tools as Array<{ agentId: string }>).map((tool) => {
        const resolvedId = idMap[tool.agentId] ?? tool.agentId;
        return { ...tool, agentId: resolvedId };
      });

      return {
        ...node,
        data: {
          ...node.data,
          tools: resolvedTools,
        },
      };
    });
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
