import type { IUserRepository } from '../domain/interfaces/repositories/IUserRepository.js';
import type { IAgentRepository } from '../domain/interfaces/repositories/IAgentRepository.js';
import type { WorkflowNode, WorkflowEdge } from '../domain/entities/Agent.js';
import { hashPassword } from '../utils/crypto.js';
import { config } from '../config/index.js';

// Default workflow: Input (text) -> LLM -> Output
const DEFAULT_NODES: WorkflowNode[] = [
  {
    id: 'input-1',
    type: 'input',
    position: { x: 100, y: 200 },
    data: {
      schema: {
        text: { type: 'string', required: true },
      },
    },
  },
  {
    id: 'llm-1',
    type: 'llm',
    position: { x: 400, y: 200 },
    data: {
      provider: 'openai',
      model: 'gpt-4o-mini',
      systemPrompt: 'You are a helpful assistant.',
      userPrompt: '{{text}}',
      temperature: 0.7,
      maxTokens: 1000,
    },
  },
  {
    id: 'output-1',
    type: 'output',
    position: { x: 700, y: 200 },
    data: {},
  },
];

const DEFAULT_EDGES: WorkflowEdge[] = [
  {
    id: 'edge-1',
    source: 'input-1',
    sourceHandle: 'text',
    target: 'llm-1',
    targetHandle: 'prompt',
  },
  {
    id: 'edge-2',
    source: 'llm-1',
    sourceHandle: 'response',
    target: 'output-1',
    targetHandle: 'value',
  },
];

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

  async seedDefaultAgent(): Promise<{ created: boolean; name: string; id?: string }> {
    // Check if any agents exist
    const agentCount = await this.agentRepo.count();

    if (agentCount > 0) {
      return { created: false, name: 'Default Agent' };
    }

    // Get admin user to assign the agent
    const admin = await this.userRepo.findByEmail(config.admin.email!);
    if (!admin) {
      return { created: false, name: 'Default Agent' };
    }

    // Create default agent
    const agent = await this.agentRepo.create({
      userId: admin.id,
      name: 'Default Agent',
      description: 'A simple text-to-LLM workflow',
      nodes: DEFAULT_NODES,
      edges: DEFAULT_EDGES,
      variables: [],
    });

    return { created: true, name: 'Default Agent', id: agent.id };
  }
}
