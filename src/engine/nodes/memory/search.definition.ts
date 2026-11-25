import type { NodeDefinitionRaw } from '../definition.types.js';
import { MEMORY_FILTER_OPERATORS } from '../../../domain/entities/Memory.js';

export const MEMORY_SEARCH_NODE_DEFINITION: NodeDefinitionRaw = {
  type: 'memory-search',
  description: 'Search records in a memory collection. Use to retrieve relevant past experiences before taking action.',
  statusText: 'Searching memory...',
  inputs: ['trigger'],
  outputs: ['records', 'count'],
  options: [
    {
      name: 'collection',
      type: 'string',
      required: true,
      description: 'Name of the memory collection.',
    },
    {
      name: 'filters',
      type: 'object',
      description: `Filter by field values. Supports {{node:id.path}} syntax and MongoDB query operators (${MEMORY_FILTER_OPERATORS.join(', ')}).`,
    },
    {
      name: 'sort',
      type: 'object',
      description: 'Sort by field. Format: { field: string, direction: "asc" | "desc" }.',
    },
    {
      name: 'fields',
      type: 'object',
      description: 'Fields to return (projection), e.g. ["name", "email"]. id/createdAt/updatedAt are always included. Omit for all fields.',
    },
    {
      name: 'limit',
      type: 'number',
      description: 'Maximum results to return.',
      default: 10,
    },
    {
      name: 'offset',
      type: 'number',
      description: 'Number of records to skip for pagination.',
      default: 0,
    },
  ],
  examples: [
    {
      name: 'Search by page',
      description: 'Find memories by name',
      id: 'memory-search-1',
      type: 'memory-search',
      data: {
        collection: 'learned_steps',
        filters: { name: '{{node:input.name}}' },
        limit: 5,
      },
    },
    {
      name: 'Search with comparison operators',
      description: 'Find active adult customers, newest first',
      id: 'memory-search-2',
      type: 'memory-search',
      data: {
        collection: 'customers',
        filters: { age: { $gte: 18 }, status: { $in: ['active', 'trial'] } },
        sort: { field: 'createdAt', direction: 'desc' },
        limit: 20,
      },
    },
    {
      name: 'Search with $or and $regex',
      description: 'Find records whose name starts with input text or that are tagged urgent',
      id: 'memory-search-3',
      type: 'memory-search',
      data: {
        collection: 'tickets',
        filters: {
          $or: [
            { title: { $regex: '^{{node:input.query}}', $options: 'i' } },
            { tags: 'urgent' },
          ],
        },
        fields: ['title', 'tags'],
        limit: 10,
      },
    },
    {
      name: 'Search recent records with pagination',
      description: 'Get the second page of records created after a date that have an email',
      id: 'memory-search-4',
      type: 'memory-search',
      data: {
        collection: 'leads',
        filters: { createdAt: { $gte: '{{node:input.since}}' }, email: { $exists: true } },
        limit: 10,
        offset: 10,
      },
    },
  ],
};
