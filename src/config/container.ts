import { MongoUserRepository } from '../infrastructure/database/mongodb/repositories/MongoUserRepository.js';
import { MongoApiKeyRepository } from '../infrastructure/database/mongodb/repositories/MongoApiKeyRepository.js';
import { MongoProviderConfigRepository } from '../infrastructure/database/mongodb/repositories/MongoProviderConfigRepository.js';
import { MongoAgentRepository } from '../infrastructure/database/mongodb/repositories/MongoAgentRepository.js';
import { MongoRunRepository } from '../infrastructure/database/mongodb/repositories/MongoRunRepository.js';
import { MongoSessionRepository } from '../infrastructure/database/mongodb/repositories/MongoSessionRepository.js';
import { MongoMessageRepository } from '../infrastructure/database/mongodb/repositories/MongoMessageRepository.js';
import { MongoUserSecretRepository } from '../infrastructure/database/mongodb/repositories/MongoUserSecretRepository.js';

import type { IUserRepository } from '../domain/interfaces/repositories/IUserRepository.js';
import type { IApiKeyRepository } from '../domain/interfaces/repositories/IApiKeyRepository.js';
import type { IProviderConfigRepository } from '../domain/interfaces/repositories/IProviderConfigRepository.js';
import type { IAgentRepository } from '../domain/interfaces/repositories/IAgentRepository.js';
import type { IRunRepository } from '../domain/interfaces/repositories/IRunRepository.js';
import type { ISessionRepository } from '../domain/interfaces/repositories/ISessionRepository.js';
import type { IMessageRepository } from '../domain/interfaces/repositories/IMessageRepository.js';
import type { IUserSecretRepository } from '../domain/interfaces/repositories/IUserSecretRepository.js';

export interface Container {
  userRepository: IUserRepository;
  apiKeyRepository: IApiKeyRepository;
  providerConfigRepository: IProviderConfigRepository;
  agentRepository: IAgentRepository;
  runRepository: IRunRepository;
  sessionRepository: ISessionRepository;
  messageRepository: IMessageRepository;
  userSecretRepository: IUserSecretRepository;
}

// Create singleton instances
// To switch databases, replace these with PostgreSQL implementations
export const container: Container = {
  userRepository: new MongoUserRepository(),
  apiKeyRepository: new MongoApiKeyRepository(),
  providerConfigRepository: new MongoProviderConfigRepository(),
  agentRepository: new MongoAgentRepository(),
  runRepository: new MongoRunRepository(),
  sessionRepository: new MongoSessionRepository(),
  messageRepository: new MongoMessageRepository(),
  userSecretRepository: new MongoUserSecretRepository(),
};
