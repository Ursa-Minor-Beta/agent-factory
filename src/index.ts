import Fastify from 'fastify';
import cors from '@fastify/cors';
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
        { name: 'system', description: 'Health check and API info' },
        { name: 'auth', description: 'Authentication and API keys' },
        { name: 'users', description: 'User management (admin)' },
        { name: 'agents', description: 'Agent CRUD operations' },
        { name: 'runs', description: 'Agent execution and history' },
        { name: 'providers', description: 'LLM provider configurations' },
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
  await app.register(settingsRoutes);
  await app.register(nodeRoutes);

  try {
    // Connect to MongoDB
    await connectDatabase();
    app.log.info('Connected to MongoDB');

    // Seed admin user and default agent on first run
    const seedService = new SeedService(container.userRepository, container.agentRepository);
    const { created: adminCreated, email } = await seedService.seedAdmin();
    if (adminCreated) {
      app.log.info(`Admin user created: ${email}`);
    }

    const { created: agentCreated, name, id: agentId } = await seedService.seedDefaultAgent();
    if (agentCreated) {
      app.log.info(`Default agent created: ${name} (id: ${agentId})`);
      app.log.info(`Run example: POST /api/agents/${agentId}/run with body: { "input": { "text": "Hello!" } }`);
    }

    // Start server
    await app.listen({
      port: config.server.port,
      host: config.server.host,
    });

    app.log.info(`Docs available at http://${config.server.host}:${config.server.port}/docs`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

bootstrap();

export { app };
