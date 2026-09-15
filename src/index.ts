import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { config, validateConfig } from './config/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import { connectDatabase } from './infrastructure/database/mongodb/connection.js';
import { authRoutes } from './routes/auth.js';
import { userRoutes } from './routes/users.js';
import { agentRoutes } from './routes/agents.js';
import { runRoutes } from './routes/runs.js';
import { settingsRoutes } from './routes/settings.js';
import { nodeRoutes } from './routes/nodes.js';
import { testRoutes } from './routes/test.js';
import { sessionRoutes } from './routes/sessions.js';
import { toolRoutes } from './routes/tools.js';
import { secretRoutes } from './routes/secrets.js';
import { fileRoutes } from './routes/files.js';
import { SeedService } from './services/seed.service.js';
import { container } from './config/container.js';

const app = Fastify({
  logger: config.server.env !== 'test',
});

async function bootstrap() {
  // Validate required config
  validateConfig();
  // Swagger documentation
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Agent Factory API',
        description: 'AI Agent workflow builder and executor',
        version: '0.1.0',
      },
      servers: [
        {
          url: `http://${config.server.host}:${config.server.port}`,
          description: 'Development server',
        },
      ],
      tags: [
        { name: 'system', description: 'Health check, API info, and test agents' },
        { name: 'auth', description: 'Authentication and API keys' },
        { name: 'users', description: 'User management (admin)' },
        { name: 'agents', description: 'Agent CRUD operations' },
        { name: 'runs', description: 'Agent execution and history' },
        { name: 'sessions', description: 'Conversation sessions with agents' },
        { name: 'providers', description: 'LLM provider configurations' },
        { name: 'secrets', description: 'Encrypted user secrets for HTTP nodes' },
        { name: 'files', description: 'Build-in file storage for message attachments' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
          apiKey: {
            type: 'apiKey',
            in: 'header',
            name: 'X-API-Key',
          },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
      displayRequestDuration: true,
      filter: true, // Adds search/filter box
      tagsSorter: 'alpha', // Sort tags alphabetically
      operationsSorter: 'alpha', // Sort operations alphabetically
      persistAuthorization: true, // Keep auth token after refresh
    },
  });

  // Register plugins
  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  await app.register(cookie);

  await app.register(jwt, {
    secret: config.jwt.secret,
  });

  // Error handler
  app.setErrorHandler(errorHandler);

  // Health check
  app.get('/health', {
    schema: {
      tags: ['system'],
      summary: 'Health check',
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' },
          },
        },
      },
    },
  }, async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  // API info
  app.get('/api', {
    schema: {
      tags: ['system'],
      summary: 'API information',
      response: {
        200: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            version: { type: 'string' },
          },
        },
      },
    },
  }, async () => ({
    name: 'Agent Factory API',
    version: '0.1.0',
  }));

  // Register routes
  await app.register(authRoutes);
  await app.register(userRoutes);
  await app.register(agentRoutes);
  await app.register(runRoutes);
  await app.register(sessionRoutes);
  await app.register(settingsRoutes);
  await app.register(secretRoutes);
  await app.register(fileRoutes);
  await app.register(nodeRoutes);
  await app.register(toolRoutes);
  await app.register(testRoutes);

  try {
    // Connect to MongoDB
    await connectDatabase();
    app.log.info('Connected to MongoDB');

    // Seed admin user and agents
    const seedService = new SeedService(container.userRepository, container.agentRepository);

    const { created: adminCreated, email } = await seedService.seedAdmin();
    if (adminCreated) {
      app.log.info(`Admin user created: ${email}`);
    }

    const { created: defaultCreated } = await seedService.seedDefaultAgent();
    if (defaultCreated) {
      app.log.info('Default agent created');
    }

    const { created: systemCreated } = await seedService.seedSystemAgents();
    if (systemCreated.length > 0) {
      app.log.info(`System agents created: ${systemCreated.join(', ')}`);
    }

    // Always log agent IDs
    const agents = await seedService.getAllAgentIds();
    app.log.info('Available agents:');
    for (const agent of agents) {
      const tag = agent.isSystem ? '[system]' : '';
      app.log.info(`  ${agent.name} ${tag}: ${agent.id}`);
    }

    // Start server
    await app.listen({
      port: config.server.port,
      host: config.server.host,
    });

    app.log.info(`Docs available at http://${config.server.host}:${config.server.port}/docs`);

    // Graceful shutdown handlers
    const shutdown = async (signal: string) => {
      app.log.info(`Received ${signal}, shutting down gracefully...`);

      // Stop accepting new requests
      await app.close();

      // Cancel all running agent executions
      app.log.info('Stopping active agent runs...');
      await container.runManager.shutdown();

      app.log.info('Shutdown complete');
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

bootstrap();

export { app };
