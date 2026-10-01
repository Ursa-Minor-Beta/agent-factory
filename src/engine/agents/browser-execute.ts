/**
 * Browser Execute Agent - Executes BaaS code on an existing session
 */

import type { WorkflowNode } from '../../domain/entities/Agent.js';

export const BROWSER_EXECUTE_NODES: WorkflowNode[] = [
  {
    id: 'input',
    type: 'input',
    data: {
      schema: {
        sessionID: {
          type: 'string',
          required: true,
        },
        baasCode: {
          type: 'string',
          required: true,
        },
        baasHost: {
          type: 'string',
          required: true,
          default: 'http://host.docker.internal:8090',
        },
      },
    },
  },
  {
    id: 'http-3',
    type: 'http',
    data: {
      method: 'POST',
      url: '{{node:input.baasHost}}/api/async/message',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer {{secret:BAAS_API_KEY}}',
      },
      body: '{"program":"{{node:input.baasCode}}","sessionID": "{{node:input.sessionID}}", "stopSession": false}',
      persistedFields: ['body', 'sseEvents'],
    },
  },
  {
    id: 'output',
    type: 'output',
    data: {
      value: '{{node:http-3.response.sessionID}}',
    },
  },
];

export const BROWSER_EXECUTE = {
  name: 'Browser Execute',
  description: 'Executes BaaS code on an existing browser session',
  nodes: BROWSER_EXECUTE_NODES,
};
