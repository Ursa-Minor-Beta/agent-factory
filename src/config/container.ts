import { MongoUserRepository } from '../infrastructure/database/mongodb/repositories/MongoUserRepository.js';
import { MongoApiKeyRepository } from '../infrastructure/database/mongodb/repositories/MongoApiKeyRepository.js';
import { MongoProviderConfigRepository } from '../infrastructure/database/mongodb/repositories/MongoProviderConfigRepository.js';
import { MongoAgentRepository } from '../infrastructure/database/mongodb/repositories/MongoAgentRepository.js';
import { MongoRunRepository } from '../infrastructure/database/mongodb/repositories/MongoRunRepository.js';
import { MongoSessionRepository } from '../infrastructure/database/mongodb/repositories/MongoSessionRepository.js';
import { MongoMessageRepository } from '../infrastructure/database/mongodb/repositories/MongoMessageRepository.js';
import { MongoUserSecretRepository } from '../infrastructure/database/mongodb/repositories/MongoUserSecretRepository.js';
import { MongoFileRepository } from '../infrastructure/database/mongodb/repositories/MongoFileRepository.js';
import { MongoMemorySchemaRepository } from '../infrastructure/database/mongodb/repositories/MongoMemorySchemaRepository.js';
import { MongoMemoryStoreRepository } from '../infrastructure/database/mongodb/repositories/MongoMemoryStoreRepository.js';
import { RunManager } from '../engine/worker/index.js';
import { config } from './index.js';

import type { IUserRepository } from '../domain/interfaces/repositories/IUserRepository.js';
import type { IApiKeyRepository } from '../domain/interfaces/repositories/IApiKeyRepository.js';
import type { IProviderConfigRepository } from '../domain/interfaces/repositories/IProviderConfigRepository.js';
import type { IAgentRepository } from '../domain/interfaces/repositories/IAgentRepository.js';
import type { IRunRepository } from '../domain/interfaces/repositories/IRunRepository.js';
import type { ISessionRepository } from '../domain/interfaces/repositories/ISessionRepository.js';
import type { IMessageRepository } from '../domain/interfaces/repositories/IMessageRepository.js';
import type { IUserSecretRepository } from '../domain/interfaces/repositories/IUserSecretRepository.js';
import type { IFileRepository } from '../domain/interfaces/repositories/IFileRepository.js';
import type { IMemorySchemaRepository } from '../domain/interfaces/repositories/IMemorySchemaRepository.js';
import type { IMemoryStoreRepository } from '../domain/interfaces/repositories/IMemoryStoreRepository.js';

export interface Container {
  userRepository: IUserRepository;
  apiKeyRepository: IApiKeyRepository;
  providerConfigRepository: IProviderConfigRepository;
  agentRepository: IAgentRepository;
  runRepository: IRunRepository;
  sessionRepository: ISessionRepository;
  messageRepository: IMessageRepository;
  userSecretRepository: IUserSecretRepository;
  fileRepository: IFileRepository;
  memorySchemaRepository: IMemorySchemaRepository;
  memoryStoreRepository: IMemoryStoreRepository;
  runManager: RunManager;
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
  } else {
    console.log(prefix, message.trim());
  }
});

export const container: Container = {
  userRepository: new MongoUserRepository(),
  apiKeyRepository: new MongoApiKeyRepository(),
  providerConfigRepository: new MongoProviderConfigRepository(),
  agentRepository: new MongoAgentRepository(),
  runRepository,
  sessionRepository: new MongoSessionRepository(),
  messageRepository: new MongoMessageRepository(),
  userSecretRepository: new MongoUserSecretRepository(),
  fileRepository: new MongoFileRepository(),
  memorySchemaRepository: new MongoMemorySchemaRepository(),
  memoryStoreRepository: new MongoMemoryStoreRepository(),
  runManager,
};
