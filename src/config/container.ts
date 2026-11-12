import { MongoUserRepository } from '../infrastructure/database/mongodb/repositories/MongoUserRepository.js';
import { MongoApiKeyRepository } from '../infrastructure/database/mongodb/repositories/MongoApiKeyRepository.js';
import { MongoProviderConfigRepository } from '../infrastructure/database/mongodb/repositories/MongoProviderConfigRepository.js';
import { MongoAgentRepository } from '../infrastructure/database/mongodb/repositories/MongoAgentRepository.js';
import { MongoAgentVersionRepository } from '../infrastructure/database/mongodb/repositories/MongoAgentVersionRepository.js';
import { MongoWorkspaceRepository } from '../infrastructure/database/mongodb/repositories/MongoWorkspaceRepository.js';
import { MongoRunRepository } from '../infrastructure/database/mongodb/repositories/MongoRunRepository.js';
import { MongoSessionRepository } from '../infrastructure/database/mongodb/repositories/MongoSessionRepository.js';
import { MongoMessageRepository } from '../infrastructure/database/mongodb/repositories/MongoMessageRepository.js';
import { MongoUserSecretRepository } from '../infrastructure/database/mongodb/repositories/MongoUserSecretRepository.js';
import { MongoUserVariableRepository } from '../infrastructure/database/mongodb/repositories/MongoUserVariableRepository.js';
import { MongoFileRepository } from '../infrastructure/database/mongodb/repositories/MongoFileRepository.js';
import { MongoMemorySchemaRepository } from '../infrastructure/database/mongodb/repositories/MongoMemorySchemaRepository.js';
import { MongoMemoryStoreRepository } from '../infrastructure/database/mongodb/repositories/MongoMemoryStoreRepository.js';
import { MongoGitHubSyncRepository } from '../infrastructure/database/mongodb/repositories/MongoGitHubSyncRepository.js';
import { MongoAgentScheduleRepository } from '../infrastructure/database/mongodb/repositories/MongoAgentScheduleRepository.js';
import { MongoWebhookRepository } from '../infrastructure/database/mongodb/repositories/MongoWebhookRepository.js';
import { RunManager } from '../engine/worker/index.js';
import { SessionService } from '../services/session.service.js';
import { ScheduleRunner } from '../services/schedule-runner.service.js';
import { config } from './index.js';

import type { IUserRepository } from '../domain/interfaces/repositories/IUserRepository.js';
import type { IApiKeyRepository } from '../domain/interfaces/repositories/IApiKeyRepository.js';
import type { IProviderConfigRepository } from '../domain/interfaces/repositories/IProviderConfigRepository.js';
import type { IAgentRepository } from '../domain/interfaces/repositories/IAgentRepository.js';
import type { IAgentVersionRepository } from '../domain/interfaces/repositories/IAgentVersionRepository.js';
import type { IWorkspaceRepository } from '../domain/interfaces/repositories/IWorkspaceRepository.js';
import type { IRunRepository } from '../domain/interfaces/repositories/IRunRepository.js';
import type { ISessionRepository } from '../domain/interfaces/repositories/ISessionRepository.js';
import type { IMessageRepository } from '../domain/interfaces/repositories/IMessageRepository.js';
import type { IUserSecretRepository } from '../domain/interfaces/repositories/IUserSecretRepository.js';
import type { IUserVariableRepository } from '../domain/interfaces/repositories/IUserVariableRepository.js';
import type { IFileRepository } from '../domain/interfaces/repositories/IFileRepository.js';
import type { IMemorySchemaRepository } from '../domain/interfaces/repositories/IMemorySchemaRepository.js';
import type { IMemoryStoreRepository } from '../domain/interfaces/repositories/IMemoryStoreRepository.js';
import type { IGitHubSyncRepository } from '../domain/interfaces/repositories/IGitHubSyncRepository.js';
import type { IAgentScheduleRepository } from '../domain/interfaces/repositories/IAgentScheduleRepository.js';
import type { IWebhookRepository } from '../domain/interfaces/repositories/IWebhookRepository.js';

export interface Container {
  userRepository: IUserRepository;
  apiKeyRepository: IApiKeyRepository;
  providerConfigRepository: IProviderConfigRepository;
  agentRepository: IAgentRepository;
  agentVersionRepository: IAgentVersionRepository;
  workspaceRepository: IWorkspaceRepository;
  runRepository: IRunRepository;
  sessionRepository: ISessionRepository;
  messageRepository: IMessageRepository;
  userSecretRepository: IUserSecretRepository;
  userVariableRepository: IUserVariableRepository;
  fileRepository: IFileRepository;
  memorySchemaRepository: IMemorySchemaRepository;
  memoryStoreRepository: IMemoryStoreRepository;
  gitHubSyncRepository: IGitHubSyncRepository;
  agentScheduleRepository: IAgentScheduleRepository;
  webhookRepository: IWebhookRepository;
  runManager: RunManager;
  scheduleRunner: ScheduleRunner;
}

// Create singleton repository instances
const runRepository = new MongoRunRepository();

// Create singleton instances
// To switch databases, replace these with PostgreSQL implementations
const runManager = new RunManager(runRepository, {
  mongoUri: config.mongodb.uri,
});

// Forward worker logs to console (for debugging worker processes)
runManager.on('log', ({ runId, level, message }) => {
  const prefix = `[Worker:${runId.slice(-6)}]`;
  if (level === 'error') {
    console.error(prefix, message.trim());
  }
  else {
    console.log(prefix, message.trim());
  }
});

const providerConfigRepository = new MongoProviderConfigRepository();
const agentRepository = new MongoAgentRepository();
const sessionRepository = new MongoSessionRepository();
const messageRepository = new MongoMessageRepository();
const userSecretRepository = new MongoUserSecretRepository();
const userVariableRepository = new MongoUserVariableRepository();
const agentScheduleRepository = new MongoAgentScheduleRepository();

// Background executor for agent schedules (started in index.ts after the server listens)
const scheduleRunner = new ScheduleRunner(
  agentScheduleRepository,
  agentRepository,
  sessionRepository,
  new SessionService(
    sessionRepository,
    messageRepository,
    agentRepository,
    runRepository,
    runManager,
    providerConfigRepository,
    userSecretRepository,
    userVariableRepository
  ),
  {
    pollIntervalMs: config.scheduler.pollIntervalMs,
    maxConcurrentRuns: config.scheduler.maxConcurrentRuns,
  }
);

export const container: Container = {
  userRepository: new MongoUserRepository(),
  apiKeyRepository: new MongoApiKeyRepository(),
  providerConfigRepository,
  agentRepository,
  agentVersionRepository: new MongoAgentVersionRepository(),
  workspaceRepository: new MongoWorkspaceRepository(),
  runRepository,
  sessionRepository,
  messageRepository,
  userSecretRepository,
  userVariableRepository,
  fileRepository: new MongoFileRepository(),
  memorySchemaRepository: new MongoMemorySchemaRepository(),
  memoryStoreRepository: new MongoMemoryStoreRepository(),
  gitHubSyncRepository: new MongoGitHubSyncRepository(),
  agentScheduleRepository,
  webhookRepository: new MongoWebhookRepository(),
  runManager,
  scheduleRunner,
};
