import { FastifyInstance } from 'fastify';
import { container } from '../config/container.js';
import { requireAuth } from '../middleware/auth.js';
import type {
  CreateMemorySchemaDTO,
  UpdateMemorySchemaDTO,
  CreateMemoryRecordDTO,
  UpdateMemoryRecordDTO,
  MemorySearchOptions,
} from '../domain/entities/Memory.js';
import * as memoryService from '../domain/services/memory.service.js';

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

const memorySchemaFieldSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    type: { type: 'string', enum: ['string', 'number', 'boolean', 'date', 'array', 'object'] },
    required: { type: 'boolean' },
    index: { type: 'boolean' },
    description: { type: 'string' },
    default: {},
    items: { type: 'string', enum: ['string', 'number', 'boolean', 'date', 'array', 'object'] },
  },
  required: ['name', 'type'],
};

const memorySchemaSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    userId: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string', nullable: true },
    fields: { type: 'array', items: memorySchemaFieldSchema },
    recordCount: { type: 'number' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const memoryRecordSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    schemaId: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
  additionalProperties: true, // User-defined schema fields at root level
};

export async function memoryRoutes(app: FastifyInstance) {
  const memorySchemaRepo = container.memorySchemaRepository;
  const memoryStoreRepo = container.memoryStoreRepository;

  // ========================================
  // Memory Schema Routes (Collection Management)
  // ========================================

  // List memory schemas
  app.get('/api/memory/schemas', {
    schema: {
      tags: ['memory'],
      summary: 'List memory collection schemas',
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
            data: { type: 'array', items: memorySchemaSchema },
          },
        },
        401: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { limit, offset } = request.query as { limit?: number; offset?: number };

    const schemas = await memorySchemaRepo.findByUserId(userId, { limit, offset });

    // Get record counts for all schemas in a single query
    const schemaIds = schemas.map((s) => s.id);
    const recordCounts = schemaIds.length > 0
      ? await memoryStoreRepo.countBySchemaIds(schemaIds)
      : new Map<string, number>();

    // Enrich schemas with record counts
    const enrichedSchemas = schemas.map((s) => ({
      ...s,
      recordCount: recordCounts.get(s.id) ?? 0,
    }));

    return reply.send({
      success: true,
      data: enrichedSchemas,
    });
  });

  // Get schema by ID
  app.get('/api/memory/schemas/:id', {
    schema: {
      tags: ['memory'],
      summary: 'Get memory schema by ID',
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
            data: memorySchemaSchema,
          },
        },
        401: errorSchema,
        404: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    const schema = await memorySchemaRepo.findById(id);
    if (!schema || schema.userId !== userId) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Memory schema not found' },
      });
    }

    return reply.send({
      success: true,
      data: schema,
    });
  });

  // Create memory schema
  app.post('/api/memory/schemas', {
    schema: {
      tags: ['memory'],
      summary: 'Create a new memory collection schema',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
          description: { type: 'string', maxLength: 500 },
          fields: { type: 'array', items: memorySchemaFieldSchema, minItems: 1 },
        },
        required: ['name', 'fields'],
      },
      response: {
        201: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: memorySchemaSchema,
          },
        },
        400: errorSchema,
        401: errorSchema,
        409: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const body = request.body as Omit<CreateMemorySchemaDTO, 'userId'>;

    // Check if name already exists
    if (await memorySchemaRepo.nameExists(userId, body.name)) {
      return reply.status(409).send({
        success: false,
        error: { code: 'CONFLICT', message: `Collection "${body.name}" already exists` },
      });
    }

    const schema = await memorySchemaRepo.create({
      ...body,
      userId,
    });

    return reply.status(201).send({
      success: true,
      data: schema,
    });
  });

  // Update memory schema
  app.patch('/api/memory/schemas/:id', {
    schema: {
      tags: ['memory'],
      summary: 'Update memory schema',
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
          name: { type: 'string', minLength: 1, maxLength: 100 },
          description: { type: 'string', maxLength: 500 },
          fields: { type: 'array', items: memorySchemaFieldSchema },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: memorySchemaSchema,
          },
        },
        400: errorSchema,
        401: errorSchema,
        404: errorSchema,
        409: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };
    const body = request.body as UpdateMemorySchemaDTO;

    // Check ownership
    const existing = await memorySchemaRepo.findById(id);
    if (!existing || existing.userId !== userId) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Memory schema not found' },
      });
    }

    // Check name conflict
    if (body.name && await memorySchemaRepo.nameExists(userId, body.name, id)) {
      return reply.status(409).send({
        success: false,
        error: { code: 'CONFLICT', message: `Collection "${body.name}" already exists` },
      });
    }

    const schema = await memorySchemaRepo.update(id, body);

    return reply.send({
      success: true,
      data: schema,
    });
  });

  // Delete memory schema and all its records
  app.delete('/api/memory/schemas/:id', {
    schema: {
      tags: ['memory'],
      summary: 'Delete memory schema and all its records',
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
            deletedRecords: { type: 'number' },
          },
        },
        401: errorSchema,
        404: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { id } = request.params as { id: string };

    // Check ownership
    const existing = await memorySchemaRepo.findById(id);
    if (!existing || existing.userId !== userId) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Memory schema not found' },
      });
    }

    // Delete all records first
    const deletedRecords = await memoryStoreRepo.deleteBySchemaId(id);

    // Delete schema
    await memorySchemaRepo.delete(id);

    return reply.send({
      success: true,
      deletedRecords,
    });
  });

  // ========================================
  // Memory Record Routes (Data Operations)
  // ========================================

  // List records in a collection
  app.get('/api/memory/:collection/records', {
    schema: {
      tags: ['memory'],
      summary: 'List records in a memory collection',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      params: {
        type: 'object',
        properties: {
          collection: { type: 'string' },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
          offset: { type: 'integer', minimum: 0, default: 0 },
          sortField: { type: 'string' },
          sortDirection: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'array', items: memoryRecordSchema },
          },
        },
        401: errorSchema,
        404: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { collection } = request.params as { collection: string };
    const { limit, offset, sortField, sortDirection } = request.query as {
      limit?: number;
      offset?: number;
      sortField?: string;
      sortDirection?: 'asc' | 'desc';
    };

    // Get schema
    const schema = await memorySchemaRepo.findByName(userId, collection);
    if (!schema) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: `Collection "${collection}" not found` },
      });
    }

    const records = await memoryStoreRepo.findBySchemaId(schema.id, {
      limit,
      offset,
      sort: sortField ? { field: sortField, direction: sortDirection ?? 'desc' } : undefined,
    });

    return reply.send({
      success: true,
      data: records,
    });
  });

  // Search records
  app.post('/api/memory/:collection/search', {
    schema: {
      tags: ['memory'],
      summary: 'Search records in a memory collection',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      params: {
        type: 'object',
        properties: {
          collection: { type: 'string' },
        },
      },
      body: {
        type: 'object',
        properties: {
          filters: { type: 'object', description: 'Filter by schema field values' },
          sort: {
            type: 'object',
            properties: {
              field: { type: 'string' },
              direction: { type: 'string', enum: ['asc', 'desc'] },
            },
          },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
          offset: { type: 'integer', minimum: 0, default: 0 },
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
                  record: memoryRecordSchema,
                },
              },
            },
          },
        },
        401: errorSchema,
        404: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { collection } = request.params as { collection: string };
    const body = request.body as Omit<MemorySearchOptions, 'schemaId'>;

    try {
      const records = await memoryService.searchMemoryRecords(
        userId,
        collection,
        {
          filters: body.filters,
          limit: body.limit,
          offset: body.offset,
          sort: body.sort,
        },
        { memorySchemaRepo, memoryStoreRepo }
      );

      return reply.send({
        success: true,
        data: records.map(record => ({ record })), // Maintain response format
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: error.message },
        });
      }
      throw error;
    }
  });

  // Create record
  app.post('/api/memory/:collection/records', {
    schema: {
      tags: ['memory'],
      summary: 'Create a record in a memory collection',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      params: {
        type: 'object',
        properties: {
          collection: { type: 'string' },
        },
      },
      body: {
        type: 'object',
        description: 'Schema fields passed directly. Example: { "name": "Alice", "email": "alice@example.com" }',
        additionalProperties: true,
      },
      response: {
        201: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: memoryRecordSchema,
          },
        },
        400: errorSchema,
        401: errorSchema,
        404: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { collection } = request.params as { collection: string };
    const body = request.body as Omit<CreateMemoryRecordDTO, 'schemaId'>;

    try {
      const record = await memoryService.saveMemoryRecord(
        userId,
        collection,
        body,
        { memorySchemaRepo, memoryStoreRepo }
      );

      return reply.status(201).send({
        success: true,
        data: record,
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: error.message },
          });
        }
        if (error.message.includes('reserved') || error.message.includes('Required field')) {
          return reply.status(400).send({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: error.message },
          });
        }
      }
      throw error;
    }
  });

  // Get record by ID
  app.get('/api/memory/:collection/records/:id', {
    schema: {
      tags: ['memory'],
      summary: 'Get a record by ID',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      params: {
        type: 'object',
        properties: {
          collection: { type: 'string' },
          id: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: memoryRecordSchema,
          },
        },
        401: errorSchema,
        404: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { collection, id } = request.params as { collection: string; id: string };

    // Get schema to verify ownership
    const schema = await memorySchemaRepo.findByName(userId, collection);
    if (!schema) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: `Collection "${collection}" not found` },
      });
    }

    const record = await memoryStoreRepo.findById(id);
    if (!record || record.schemaId !== schema.id) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Record not found' },
      });
    }

    return reply.send({
      success: true,
      data: record,
    });
  });

  // Update record
  app.patch('/api/memory/:collection/records/:id', {
    schema: {
      tags: ['memory'],
      summary: 'Update a record',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      params: {
        type: 'object',
        properties: {
          collection: { type: 'string' },
          id: { type: 'string' },
        },
      },
      body: {
        type: 'object',
        description: 'Schema fields to update passed directly. Example: { "email": "newemail@example.com" }',
        additionalProperties: true,
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: memoryRecordSchema,
          },
        },
        401: errorSchema,
        404: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { collection, id } = request.params as { collection: string; id: string };
    const body = request.body as UpdateMemoryRecordDTO;

    try {
      const record = await memoryService.updateMemoryRecord(
        userId,
        collection,
        id,
        body,
        { memorySchemaRepo, memoryStoreRepo }
      );

      return reply.send({
        success: true,
        data: record,
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: error.message },
          });
        }
        if (error.message.includes('reserved') || error.message.includes('Required field')) {
          return reply.status(400).send({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: error.message },
          });
        }
      }
      throw error;
    }
  });

  // Delete record
  app.delete('/api/memory/:collection/records/:id', {
    schema: {
      tags: ['memory'],
      summary: 'Delete a record',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      params: {
        type: 'object',
        properties: {
          collection: { type: 'string' },
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
        404: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { collection, id } = request.params as { collection: string; id: string };

    try {
      await memoryService.deleteMemoryRecord(
        userId,
        collection,
        id,
        { memorySchemaRepo, memoryStoreRepo }
      );

      return reply.send({
        success: true,
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: error.message },
        });
      }
      throw error;
    }
  });

  // Count records
  app.post('/api/memory/:collection/count', {
    schema: {
      tags: ['memory'],
      summary: 'Count records in a collection',
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      params: {
        type: 'object',
        properties: {
          collection: { type: 'string' },
        },
      },
      body: {
        type: 'object',
        properties: {
          filters: { type: 'object' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            count: { type: 'number' },
          },
        },
        401: errorSchema,
        404: errorSchema,
      },
    },
    preHandler: requireAuth,
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string };
    const { collection } = request.params as { collection: string };
    const { filters } = request.body as { filters?: Record<string, unknown> };

    // Get schema
    const schema = await memorySchemaRepo.findByName(userId, collection);
    if (!schema) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: `Collection "${collection}" not found` },
      });
    }

    const count = await memoryStoreRepo.count(schema.id, filters);

    return reply.send({
      success: true,
      count,
    });
  });
}
