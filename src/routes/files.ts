import { FastifyInstance } from 'fastify';
import { container } from '../config/container.js';
import { requireAuth } from '../middleware/auth.js';

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

const fileSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    userId: { type: 'string' },
    name: { type: 'string' },
    mimeType: { type: 'string' },
    size: { type: 'integer' },
    data: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

const fileListItemSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    mimeType: { type: 'string' },
    size: { type: 'integer' },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

export async function fileRoutes(app: FastifyInstance) {
  const fileRepo = container.fileRepository;

  // List files (without data)
  app.get('/api/files', {
    schema: {
      tags: ['files'],
      summary: 'List files',
      description: 'Returns file metadata without the actual data',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
          offset: { type: 'integer', minimum: 0, default: 0 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'array', items: fileListItemSchema },
          },
        },
        401: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async (request) => {
    const { userId } = request.user as { userId: string };
    const { limit = 50, offset = 0 } = request.query as { limit?: number; offset?: number };

    const files = await fileRepo.listByUserId(userId, { limit, offset });

    return { success: true, data: files };
  });

  // Get file by ID
  app.get('/api/files/:id', {
    schema: {
      tags: ['files'],
      summary: 'Get file by ID',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: fileSchema,
          },
        },
        404: errorSchema,
        403: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    const file = await fileRepo.findById(id);
    if (!file) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'File not found' },
      });
    }

    if (file.userId !== userId) {
      return reply.status(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied' },
      });
    }

    return { success: true, data: file };
  });

  // Delete files by ID(s)
  app.post('/api/files/delete', {
    schema: {
      tags: ['files'],
      summary: 'Delete files by ID(s)',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      body: {
        type: 'object',
        properties: {
          id: { description: 'Single file ID or array of IDs' },
        },
        required: ['id'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            deletedCount: { type: 'integer' },
          },
        },
        403: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.body as { id: string | string[] };

    const ids = Array.isArray(id) ? id : [id];

    // Verify ownership of all files
    const files = await fileRepo.findByIds(ids);
    const unauthorized = files.filter((f) => f.userId !== userId);
    if (unauthorized.length > 0) {
      return reply.status(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied to one or more files' },
      });
    }

    // Only delete files that exist and belong to the user
    const ownedIds = files.map((f) => f.id);
    const deletedCount = ownedIds.length > 0 ? await fileRepo.deleteBy({ id: ownedIds }) : 0;

    return { success: true, deletedCount };
  });
}
