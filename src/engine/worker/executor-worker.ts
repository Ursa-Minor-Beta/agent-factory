/**
 * Worker process entry point for executing agent runs.
 * This file runs in a separate child process, isolated from the main server.
 */
import mongoose from 'mongoose';
import type { ParentMessage, WorkerMessage, WorkerExecutionConfig } from './messages.js';
import { WorkerExecutor } from './worker-executor.js';
import type { ClientToolCall } from '../nodes/base.js';
import { config as appConfig } from '../../config/index.js';
import { MongoRunRepository } from '../../infrastructure/database/mongodb/repositories/MongoRunRepository.js';
import { MongoFileRepository } from '../../infrastructure/database/mongodb/repositories/MongoFileRepository.js';
import { MongoAgentRepository } from '../../infrastructure/database/mongodb/repositories/MongoAgentRepository.js';
import { MongoMessageRepository } from '../../infrastructure/database/mongodb/repositories/MongoMessageRepository.js';
import { MongoSessionRepository } from '../../infrastructure/database/mongodb/repositories/MongoSessionRepository.js';
import { MongoMemorySchemaRepository } from '../../infrastructure/database/mongodb/repositories/MongoMemorySchemaRepository.js';
import { MongoMemoryStoreRepository } from '../../infrastructure/database/mongodb/repositories/MongoMemoryStoreRepository.js';
import { MongoUserSecretRepository } from '../../infrastructure/database/mongodb/repositories/MongoUserSecretRepository.js';
import { MongoUserVariableRepository } from '../../infrastructure/database/mongodb/repositories/MongoUserVariableRepository.js';
import { MongoAgentScheduleRepository } from '../../infrastructure/database/mongodb/repositories/MongoAgentScheduleRepository.js';
import { MongoWebhookRepository } from '../../infrastructure/database/mongodb/repositories/MongoWebhookRepository.js';
import { UserSecretService } from '../../services/user-secret.service.js';
import { AgentScheduleService } from '../../services/agent-schedule.service.js';
import { WebhookService } from '../../services/webhook.service.js';
import { UserVariableService } from '../../services/user-variable.service.js';

let shouldStop = false;
let currentExecutor: WorkerExecutor | null = null;

/** Client tool calls waiting for a result from the parent (UI), keyed by toolCallId */
const pendingClientToolCalls = new Map<string, { resolve: (result: unknown) => void; timer: NodeJS.Timeout }>();

/**
 * Ask the client to execute a tool and wait for its result (or time out)
 */
function requestClientTool(call: ClientToolCall): Promise<unknown> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingClientToolCalls.delete(call.toolCallId);
      resolve({ error: `Client did not respond to tool "${call.name}" within ${appConfig.llm.clientToolTimeoutMs}ms` });
    }, appConfig.llm.clientToolTimeoutMs);

    pendingClientToolCalls.set(call.toolCallId, { resolve, timer });
    sendMessage({ type: 'client-tool-call', call });
  });
}

function resolveClientToolCall(toolCallId: string, result: unknown): void {
  const pending = pendingClientToolCalls.get(toolCallId);
  if (!pending) return; // Late or duplicate result
  clearTimeout(pending.timer);
  pendingClientToolCalls.delete(toolCallId);
  pending.resolve(result);
}

/**
 * Send message to parent process
 */
function sendMessage(msg: WorkerMessage): void {
  if (process.send) {
    process.send(msg);
  }
}

/**
 * Connect to MongoDB with the provided URI
 */
async function connectDatabase(uri: string): Promise<void> {
  await mongoose.connect(uri);
}

/**
 * Disconnect from MongoDB
 */
async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}

/**
 * Execute the workflow
 */
async function executeRun(config: WorkerExecutionConfig): Promise<void> {
  try {
    // Connect to database
    await connectDatabase(config.mongoUri);

    // Create repositories
    const runRepo = new MongoRunRepository();
    const fileRepo = new MongoFileRepository();
    const agentRepo = new MongoAgentRepository();
    const messageRepo = new MongoMessageRepository();
    const sessionRepo = new MongoSessionRepository();
    const memorySchemaRepo = new MongoMemorySchemaRepository();
    const memoryStoreRepo = new MongoMemoryStoreRepository();
    const userSecretService = new UserSecretService(new MongoUserSecretRepository());
    const userVariableService = new UserVariableService(new MongoUserVariableRepository());
    // The schedule runner lives in the main process and picks up changes on its next poll
    const scheduleService = new AgentScheduleService(new MongoAgentScheduleRepository(), agentRepo, sessionRepo);
    const webhookService = new WebhookService(
      new MongoWebhookRepository(),
      agentRepo,
      null,
      new MongoUserSecretRepository(),
      new MongoUserVariableRepository()
    );

    // Create executor with callbacks
    currentExecutor = new WorkerExecutor(runRepo, fileRepo, agentRepo, messageRepo, memorySchemaRepo, memoryStoreRepo, {
      shouldStop: () => shouldStop,
      onNodeStarted: (nodeId, nodeType) => sendMessage({ type: 'node-started', nodeId, nodeType }),
      onNodeCompleted: (nodeId, nodeType, state) => sendMessage({ type: 'node-completed', nodeId, nodeType, state }),
      onNodeFailed: (nodeId, nodeType, error) => sendMessage({ type: 'node-failed', nodeId, nodeType, error }),
      onNodeSkipped: (nodeId, nodeType) => sendMessage({ type: 'node-skipped', nodeId, nodeType }),
      onSubAgentNodeEvent: (event) => sendMessage({ type: 'subagent-node', event }),
      onToolCallEvent: (event) => sendMessage({ type: 'tool-call', event }),
    }, { scheduleService, webhookService });

    sendMessage({ type: 'started' });

    // Track current notes for append operations
    let currentNotes = config.sessionContext?.notes ?? '';

    // Build session context if provided
    const sessionContext = config.sessionContext
      ? {
        sessionId: config.sessionContext.sessionId,
        messages: config.sessionContext.messages,
        notes: config.sessionContext.notes,
        maxNotesLength: config.sessionContext.maxNotesLength,
        onNotesUpdate: async (notes: string) => {
          // Update local cache for append operations
          currentNotes = notes;
          // Persist to database (skip for incognito sessions)
          if (!config.sessionContext!.sessionId.startsWith('incognito_')) {
            await sessionRepo.update(config.sessionContext!.sessionId, { notes });
          }
        },
      }
      : undefined;

    // Execute workflow
    const result = await currentExecutor.execute(
      config.runId,
      config.agent,
      config.input,
      config.userId,
      {
        providers: config.providers,
        resolvedSecrets: config.resolvedSecrets,
        resolvedVariables: config.resolvedVariables,
        // Sub-agents in another workspace get that workspace's secrets/variables (workspace-scoped takes precedence)
        resolveScope: async (userId, workspaceId) => ({
          secrets: await userSecretService.buildSecretsMap(userId, workspaceId),
          variables: await userVariableService.buildVariablesMap(userId, workspaceId),
        }),
        sessionContext,
        maxParallelNodes: config.maxParallelNodes,
        clientTools: config.clientTools,
        requestClientTool: config.clientTools?.length ? requestClientTool : undefined,
      }
    );

    if (shouldStop || result.status === 'cancelled') {
      sendMessage({ type: 'cancelled' });
    }
    else if (result.status === 'completed') {
      sendMessage({ type: 'completed', output: result.output, files: result.files });
    }
    else {
      sendMessage({ type: 'failed', error: result.error ?? 'Unknown error' });
    }
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    sendMessage({ type: 'failed', error: errorMessage });
  }
  finally {
    await disconnectDatabase();
    process.exit(0);
  }
}

/**
 * Handle messages from parent process
 */
process.on('message', (msg: ParentMessage) => {
  switch (msg.type) {
  case 'start':
    executeRun(msg.config);
    break;

  case 'cancel':
    shouldStop = true;
    if (currentExecutor) {
      currentExecutor.requestStop();
    }
    break;

  case 'client-tool-result':
    resolveClientToolCall(msg.toolCallId, msg.result);
    break;
  }
});

/**
 * Handle graceful shutdown signals
 */
process.on('SIGTERM', () => {
  shouldStop = true;
  if (currentExecutor) {
    currentExecutor.requestStop();
  }
});

process.on('SIGINT', () => {
  shouldStop = true;
  if (currentExecutor) {
    currentExecutor.requestStop();
  }
});

/**
 * Handle uncaught errors
 */
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception in worker:', error);
  sendMessage({ type: 'failed', error: `Uncaught exception: ${error.message}` });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection in worker:', reason);
  const errorMessage = reason instanceof Error ? reason.message : String(reason);
  sendMessage({ type: 'failed', error: `Unhandled rejection: ${errorMessage}` });
  process.exit(1);
});
