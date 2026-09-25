/**
 * Browser Screenshot Agent - Takes a screenshot of a URL using BaaS
 * Uses HTTP calls to Browser-as-a-Service API
 */

import type { WorkflowNode } from '../../domain/entities/Agent.js';

export const BROWSER_SCREENSHOT_NODES: WorkflowNode[] = [
  {
    id: 'input-1',
    type: 'input',
    data: {
      schema: {
        url: {
          type: 'string',
          required: true,
        },
        baasHost: {
          type: 'string',
          required: true,
          default: 'http://host.docker.internal:8090'
        },
      },
    },
  },
  {
    id: 'http-0',
    type: 'http',
    data: {
      method: 'POST',
      url: '{{node:input-1.baasHost}}/api/async/start',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer {{secret:BAAS_API_KEY}}',
      },
      body: '{"browser":{"timeout": "300s"}, "hold": false}',
    },
  },
  {
    id: 'http-1',
    type: 'http',
    data: {
      method: 'POST',
      url: '{{node:input-1.baasHost}}/api/async/message',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer {{secret:BAAS_API_KEY}}',
      },
      body: '{"program":"navigate(\'{{node:input-1.url}}\'); sleep(\'3s\'); takeScreenshot(\'screenshot\', \'timeout:10s\');", "sessionID": "{{node:http-0.response.result.sessionID}}", "stopSession": false}',
      persistedFields: ['body', 'sseEvents'],
    },
  },
  {
    id: 'output-1',
    type: 'output',
    data: {
      sessionID: "Session ID: \n\n {{node:http-0.response.result.sessionID}}",
      screenshots: "{{node:http-1.response.screenshots}}"
    },
  },
];

export const BROWSER_SCREENSHOT = {
  name: 'Browser Screenshot',
  description: 'Takes a screenshot of a URL using Browser-as-a-Service API',
  nodes: BROWSER_SCREENSHOT_NODES,
};
