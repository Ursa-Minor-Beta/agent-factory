import type { IRunRepository, RunQueryOptions, RunQueryResult } from '../domain/interfaces/repositories/IRunRepository.js';
import type { IAgentRepository } from '../domain/interfaces/repositories/IAgentRepository.js';
import type { IProviderConfigRepository } from '../domain/interfaces/repositories/IProviderConfigRepository.js';
import type { IUserSecretRepository } from '../domain/interfaces/repositories/IUserSecretRepository.js';
import type { Run } from '../domain/entities/Run.js';
import type { RunManager } from '../engine/worker/index.js';
import { ProviderConfigService } from './provider-config.service.js';
import { UserSecretService } from './user-secret.service.js';
import { NotFoundError, ForbiddenError } from '../utils/errors.js';

export class RunService {
  private providerConfigService: ProviderConfigService;
  private userSecretService: UserSecretService;

  constructor(
    private runRepo: IRunRepository,
    private agentRepo: IAgentRepository,
    private runManager: RunManager,
    providerConfigRepo: IProviderConfigRepository,
    userSecretRepo: IUserSecretRepository
  ) {
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

    // Create run record
    let run = await this.runRepo.create({
      agentId: agent.id,
      userId,
      input,
    });

    // Update status to running
    run = (await this.runRepo.updateStatus(run.id, 'running'))!;

    // Execute in worker and wait for completion
    await this.runManager.executeAndWait(run.id, {
      agent,
      input,
      userId,
      providers,
      resolvedSecrets,
    });

    // Fetch final run state from DB
    const finalRun = await this.runRepo.findById(run.id);
    if (!finalRun) {
      throw new Error('Run not found after execution');
    }

    return finalRun;
  }

  /**
   * Cancel a running execution
   */
  async cancel(userId: string, runId: string): Promise<Run> {
    // Verify ownership
    const run = await this.getById(userId, runId);

    // Check if run can be cancelled
    if (run.status !== 'pending' && run.status !== 'running') {
      throw new Error(`Cannot cancel run with status '${run.status}'`);
    }

    // Cancel via RunManager (handles both in-memory and DB-only cases)
    const cancelled = await this.runManager.cancelRun(runId);
    if (!cancelled) {
      throw new Error('Failed to cancel run');
    }

    // Return updated run
    const updatedRun = await this.runRepo.findById(runId);
    if (!updatedRun) {
      throw new Error('Run not found after cancellation');
    }

    return updatedRun;
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
