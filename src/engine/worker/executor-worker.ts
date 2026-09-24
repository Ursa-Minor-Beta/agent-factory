/**
 * Worker process entry point for executing agent runs.
 * This file runs in a separate child process, isolated from the main server.
 */
import mongoose from 'mongoose';
import type { ParentMessage, WorkerMessage, WorkerExecutionConfig } from './messages.js';
import { WorkerExecutor } from './worker-executor.js';
import { MongoRunRepository } from '../../infrastructure/database/mongodb/repositories/MongoRunRepository.js';
import { MongoFileRepository } from '../../infrastructure/database/mongodb/repositories/MongoFileRepository.js';
import { MongoAgentRepository } from '../../infrastructure/database/mongodb/repositories/MongoAgentRepository.js';
import { MongoMessageRepository } from '../../infrastructure/database/mongodb/repositories/MongoMessageRepository.js';
import { MongoSessionRepository } from '../../infrastructure/database/mongodb/repositories/MongoSessionRepository.js';
import { MongoMemorySchemaRepository } from '../../infrastructure/database/mongodb/repositories/MongoMemorySchemaRepository.js';
import { MongoMemoryStoreRepository } from '../../infrastructure/database/mongodb/repositories/MongoMemoryStoreRepository.js';

let shouldStop = false;
let currentExecutor: WorkerExecutor | null = null;

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

    // Create executor with callbacks
    currentExecutor = new WorkerExecutor(runRepo, fileRepo, agentRepo, messageRepo, memorySchemaRepo, memoryStoreRepo, {
      shouldStop: () => shouldStop,
      onNodeStarted: (nodeId, nodeType) => sendMessage({ type: 'node-started', nodeId, nodeType }),
      onNodeCompleted: (nodeId, nodeType, state) => sendMessage({ type: 'node-completed', nodeId, nodeType, state }),
      onNodeFailed: (nodeId, nodeType, error) => sendMessage({ type: 'node-failed', nodeId, nodeType, error }),
      onNodeSkipped: (nodeId, nodeType) => sendMessage({ type: 'node-skipped', nodeId, nodeType }),
    });

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
        sessionContext,
      }
    );

    if (shouldStop || result.status === 'cancelled') {
      sendMessage({ type: 'cancelled' });
    } else if (result.status === 'completed') {
      sendMessage({ type: 'completed', output: result.output, files: result.files });
    } else {
      sendMessage({ type: 'failed', error: result.error ?? 'Unknown error' });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    sendMessage({ type: 'failed', error: errorMessage });
  } finally {
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
