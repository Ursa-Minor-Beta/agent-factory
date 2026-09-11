import type { IRunRepository, RunQueryOptions, RunQueryResult } from '../domain/interfaces/repositories/IRunRepository.js';
import type { IAgentRepository } from '../domain/interfaces/repositories/IAgentRepository.js';
import type { IProviderConfigRepository } from '../domain/interfaces/repositories/IProviderConfigRepository.js';
import type { IUserSecretRepository } from '../domain/interfaces/repositories/IUserSecretRepository.js';
import type { Run } from '../domain/entities/Run.js';
import { WorkflowExecutor } from '../engine/executor.js';
import { ProviderConfigService } from './provider-config.service.js';
import { UserSecretService } from './user-secret.service.js';
import { NotFoundError, ForbiddenError } from '../utils/errors.js';

export class RunService {
  private executor: WorkflowExecutor;
  private providerConfigService: ProviderConfigService;
  private userSecretService: UserSecretService;

  constructor(
    private runRepo: IRunRepository,
    private agentRepo: IAgentRepository,
    providerConfigRepo: IProviderConfigRepository,
    userSecretRepo: IUserSecretRepository
  ) {
    this.executor = new WorkflowExecutor(runRepo);
    this.providerConfigService = new ProviderConfigService(providerConfigRepo);
    this.userSecretService = new UserSecretService(userSecretRepo);
  }

  async run(
    userId: string,
    agentId: string,
    input: Record<string, unknown>
  ): Promise<Run> {
    const agent = await this.agentRepo.findById(agentId);
    if (!agent) {
      throw new NotFoundError('Agent');
    }
    if (agent.userId !== userId) {
      throw new ForbiddenError('Access denied');
    }

    // Build provider config from stored defaults
    const providers = await this.providerConfigService.buildExecutionConfig(userId);

    // Pre-resolve all user secrets for {{secret:KEY}} interpolation
    const resolvedSecrets = await this.userSecretService.buildSecretsMap(userId);

    // Pass repositories for sub-agent execution support
    return this.executor.execute(agent, input, userId, {
      providers,
      agentRepo: this.agentRepo,
      runRepo: this.runRepo,
      userId,
      callStack: new Set([agentId]), // Initialize call stack with current agent
      resolvedSecrets,
    });
  }

  async getById(userId: string, runId: string): Promise<Run> {
    const run = await this.runRepo.findById(runId);
    if (!run) {
      throw new NotFoundError('Run');
    }
    if (run.userId !== userId) {
      throw new ForbiddenError('Access denied');
    }
    return run;
  }

  async listByAgent(userId: string, agentId: string, limit = 50): Promise<Run[]> {
    const agent = await this.agentRepo.findById(agentId);
    if (!agent) {
      throw new NotFoundError('Agent');
    }
    if (agent.userId !== userId) {
      throw new ForbiddenError('Access denied');
    }

    return this.runRepo.findByAgentId(agentId, limit);
  }

  async listByUser(userId: string, limit = 50): Promise<Run[]> {
    return this.runRepo.findByUserId(userId, limit);
  }

  async listAll(options?: RunQueryOptions): Promise<RunQueryResult> {
    return this.runRepo.findAll(options);
  }
}
