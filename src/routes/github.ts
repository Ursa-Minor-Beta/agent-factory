import { FastifyInstance } from 'fastify';
import { container } from '../config/container.js';
import { requireAuth } from '../middleware/auth.js';
import * as githubSyncService from '../domain/services/github-sync.service.js';
import { GITHUB_SYNC_ENTITY, GITHUB_SYNC_STATUS } from '../domain/entities/GitHubSync.js';

const errorSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    error: {
      type: 'object',
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
      },
    },
  },
};

const gitHubSyncSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    userId: { type: 'string' },
    entityType: { type: 'string', enum: Object.values(GITHUB_SYNC_ENTITY) },
    entityId: { type: 'string' },
    providerName: { type: 'string' },
    publicRepo: { type: 'boolean' },
    repository: { type: 'string' },
    branch: { type: 'string' },
    path: { type: 'string' },
    status: { type: 'string', enum: Object.values(GITHUB_SYNC_STATUS) },
    lastCommitSha: { type: 'string', nullable: true },
    lastSyncedAt: { type: 'string', format: 'date-time', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

function getDeps() {
  return {
    gitHubSyncRepo: container.gitHubSyncRepository,
    providerConfigRepo: container.providerConfigRepository,
    agentRepo: container.agentRepository,
    exportDeps: {
      agentRepo: container.agentRepository,
      workspaceRepo: container.workspaceRepository,
      memorySchemaRepo: container.memorySchemaRepository,
    },
    importDeps: {
      agentRepo: container.agentRepository,
      workspaceRepo: container.workspaceRepository,
      memorySchemaRepo: container.memorySchemaRepository,
    },
  };
}

export async function githubRoutes(app: FastifyInstance) {
  // Link agent to GitHub
  app.post('/api/agents/:id/github/link', {
    schema: {
      tags: ['github'],
      summary: 'Link agent to GitHub repository',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
      },
      body: {
        type: 'object',
        required: ['repository', 'path'],
        properties: {
          providerName: { type: 'string', description: 'GitHub provider name (uses default if not specified)' },
          publicRepo: { type: 'boolean', description: 'Public repo - no auth needed (read-only)', default: false },
          repository: { type: 'string', description: 'GitHub repository (owner/repo or full URL)' },
          branch: { type: 'string', default: 'main' },
          path: { type: 'string', description: 'File path in repository' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: gitHubSyncSchema,
          },
        },
        400: errorSchema,
        401: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };
    const { providerName, publicRepo, repository, branch, path } = request.body as {
      providerName?: string;
      publicRepo?: boolean;
      repository: string;
      branch?: string;
      path: string;
    };

    const sync = await githubSyncService.linkToGitHub({
      userId,
      entityType: GITHUB_SYNC_ENTITY.AGENT,
      entityId: id,
      providerName,
      publicRepo,
      repository,
      branch,
      path,
    }, getDeps());

    return reply.send({ success: true, data: sync });
  });

  // Unlink agent from GitHub
  app.delete('/api/agents/:id/github/link', {
    schema: {
      tags: ['github'],
      summary: 'Unlink agent from GitHub repository',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
          },
        },
        401: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    await githubSyncService.unlinkFromGitHub(
      userId,
      GITHUB_SYNC_ENTITY.AGENT,
      id,
      getDeps()
    );

    return reply.send({ success: true });
  });

  // Get GitHub sync status
  app.get('/api/agents/:id/github', {
    schema: {
      tags: ['github'],
      summary: 'Get GitHub sync status for agent',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { ...gitHubSyncSchema, nullable: true },
          },
        },
        401: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    const sync = await githubSyncService.getSyncStatus(
      userId,
      GITHUB_SYNC_ENTITY.AGENT,
      id,
      getDeps()
    );

    return reply.send({ success: true, data: sync });
  });

  // Push agent to GitHub
  app.post('/api/agents/:id/github/push', {
    schema: {
      tags: ['github'],
      summary: 'Push agent to GitHub',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
      },
      body: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Commit message' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                commitSha: { type: 'string' },
                message: { type: 'string' },
              },
            },
          },
        },
        400: errorSchema,
        401: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };
    const { message } = request.body as { message?: string };

    const result = await githubSyncService.pushAgent(
      userId,
      id,
      message ?? '[AF] Push agent',
      getDeps()
    );

    if (!result.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'PUSH_FAILED', message: result.error },
      });
    }

    return reply.send({
      success: true,
      data: { commitSha: result.commitSha, message: result.message },
    });
  });

  // Pull agent from GitHub (updates existing linked agent in place)
  app.post('/api/agents/:id/github/pull', {
    schema: {
      tags: ['github'],
      summary: 'Pull agent from GitHub (updates existing agent in place)',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
      },
      body: {
        type: 'object',
        properties: {
          commitSha: { type: 'string', description: 'Specific commit SHA to pull (defaults to latest)' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                agentId: { type: 'string' },
                message: { type: 'string' },
              },
            },
          },
        },
        400: errorSchema,
        401: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };
    const { commitSha } = request.body as { commitSha?: string };

    const result = await githubSyncService.pullAgent(userId, id, getDeps(), commitSha);

    if (!result.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'PULL_FAILED', message: result.error },
      });
    }

    return reply.send({
      success: true,
      data: { agentId: result.agentId, message: result.message },
    });
  });

  // Import agent from GitHub (new agent)
  app.post('/api/agents/github/import', {
    schema: {
      tags: ['github'],
      summary: 'Import agent from GitHub repository',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      body: {
        type: 'object',
        required: ['repository', 'path'],
        properties: {
          providerName: { type: 'string', description: 'GitHub provider name (uses default if not specified)' },
          publicRepo: { type: 'boolean', description: 'Public repo - no auth needed (read-only)', default: false },
          repository: { type: 'string', description: 'GitHub repository (owner/repo or full URL)' },
          path: { type: 'string', description: 'File path in repository' },
          branch: { type: 'string', default: 'main' },
          workspaceId: { type: 'string', description: 'Import into workspace' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                agentId: { type: 'string' },
                message: { type: 'string' },
              },
            },
          },
        },
        400: errorSchema,
        401: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { providerName, publicRepo, repository, path, branch, workspaceId } = request.body as {
      providerName?: string;
      publicRepo?: boolean;
      repository: string;
      path: string;
      branch?: string;
      workspaceId?: string;
    };

    const result = await githubSyncService.importFromGitHub(
      userId,
      repository,
      path,
      branch ?? 'main',
      providerName,
      publicRepo ?? false,
      getDeps(),
      workspaceId
    );

    if (!result.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'IMPORT_FAILED', message: result.error },
      });
    }

    return reply.send({
      success: true,
      data: { agentId: result.agentId, message: result.message },
    });
  });

  // List commits for agent
  app.get('/api/agents/:id/github/commits', {
    schema: {
      tags: ['github'],
      summary: 'List GitHub commits for agent',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  sha: { type: 'string' },
                  message: { type: 'string' },
                  date: { type: 'string', format: 'date-time' },
                  author: { type: 'string' },
                },
              },
            },
          },
        },
        400: errorSchema,
        401: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    try {
      const commits = await githubSyncService.listAgentCommits(userId, id, getDeps());
      return reply.send({ success: true, data: commits });
    } catch (error) {
      return reply.status(400).send({
        success: false,
        error: { code: 'LIST_COMMITS_FAILED', message: error instanceof Error ? error.message : 'Unknown error' },
      });
    }
  });
}
