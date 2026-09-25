/**
 * Test Orchestrator - Generates test steps from Jira ticket and executes them via sub-agent
 * Note: The agentId placeholder '{{AGENT_ID:Test Step Executor}}' is replaced during seeding
 */

import type { WorkflowNode } from '../../../domain/entities/Agent.js';

export const TEST_ORCHESTRATOR_NODES: WorkflowNode[] = [
  {
    id: 'input-1',
    type: 'input',
    data: {
      schema: {
        url: {
          type: 'string',
          required: true,
          default: 'https://google.com/',
        },
        jiraId: {
          type: 'string',
          required: true,
        },
        jiraEmail: {
          type: 'string',
          required: false,
          default: 'qq@test.ai',
        },
        baasHost: {
          type: 'string',
          required: true,
          default: 'http://host.docker.internal:8090',
        },
        jiraSubdomain: {
          type: 'string',
          required: true,
          default: 'icos-dev',
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
      body: `{"program":"navigate('{{node:input-1.url}}'); sleep('3s'); waitReady('form','timeout:20s'); click('input[type=email]'); sendKeysToElement('input[type=email]','testkatja@testkatja.me'); sleep('1s'); click('button[type=submit]'); waitReady('input[type=password]','timeout:20s'); click('input[type=password]'); sendKeysToElement('input[type=password]','Test1234!'); click('button[type=submit]'); sleep('10s'); takeScreenshot('screenshot', 'timeout:10s');", "sessionID": "{{node:http-0.response.result.sessionID}}", "stopSession": false}`,
      persistedFields: ['body', 'sseEvents'],
    },
  },
  {
    id: 'http-jira',
    type: 'http',
    data: {
      method: 'GET',
      url: 'https://{{node:input-1.jiraSubdomain}}.atlassian.net/rest/api/2/issue/{{node:input-1.jiraId}}',
      headers: {
        Authorization: 'Basic {{secret:Jira_auth}}',
        Accept: 'application/json',
      },
      persistedFields: ['url', 'headers'],
    },
  },
  {
    id: 'http-jira-comments',
    type: 'http',
    data: {
      method: 'GET',
      url: 'https://{{node:input-1.jiraSubdomain}}.atlassian.net/rest/api/2/issue/{{node:input-1.jiraId}}/comment',
      headers: {
        Authorization: 'Basic {{secret:Jira_auth}}',
        Accept: 'application/json',
      },
      persistedFields: ['url', 'status'],
    },
  },
  {
    id: 'js-extract-desc',
    type: 'js',
    data: {
      input: '{{node:http-jira.response}}',
      code: "const fields = (input && input.fields) || {}; const summary = fields.summary || ''; const description = fields.description || '(no description provided)'; return { summary, description,}",
    },
  },
  {
    id: 'js-extract-comment',
    type: 'js',
    data: {
      input: '{{node:http-jira-comments.response}}',
      code: "const commentsArr = (input.comments && input.comments.comments) || []; const comments = commentsArr.length ? commentsArr.map(function(c){ var body = c.body || ''; return body; }).join('\\n\\n') : '(no comments)'; return { comments }",
    },
  },
  {
    id: 'llm-generate-steps',
    type: 'llm',
    data: {
      provider: 'openai',
      model: 'gpt-4o',
      systemPrompt: `You are a senior QA engineer with deep expertise in EOS and Level 10 (L10) meetings.
TASK
Given a bug's summary, description, comments, and a screenshot of the initial page, produce a concise, ordered list of manual test steps needed to verify the bug and confirm its fix.
GENERAL RULES
- Be as specific as possible: name exact buttons, menu items, icons, and labels to click.
- Each test step must contain exactly ONE user action.
- The application has a single-level main menu, with tabs within each section.
- If an action must be repeated N times, write N separate steps. Never use the word 'Repeat' inside a step.
- Steps are executed independently — never reference or assume completion of a previous step within a step's text.
- Use the bug comments as additional context: they may contain clarifications, reproduction details, root cause notes, or confirmation of the fix that are not present in the original description.
REUSABLE PROCEDURES
Use these exact sequences whenever the scenario calls for them.
Procedure 1 — Start an L10 meeting
Choose exactly ONE option below, based on what the screenshot shows. Never use both.
  Option A — Use this if 'Return to meeting' (with a timer) IS visible in the screenshot, even if the task is to START a meeting. This produces 2 steps:
    1. Click 'Return to meeting'.
    2. If a 'Resume' button appears, click it. If the meeting is already active, do nothing further.
  Option B — Use this if 'Return to meeting' is NOT visible in the screenshot. This produces 3 steps:
    1. Click 'Meetings' on the main menu.
    2. Click 'Start L10' in the top right. The initial meeting page appears, showing an empty calendar.
    3. Click 'Start' and wait. The meeting should start within 15 seconds.
  Procedure 2 — Archive a board
    1. Click the board name to open its cards.
    2. Click the settings (gear) icon.
    3. Click 'Archive' in the dropdown.
    4. Click 'OK' in the confirmation alert.
  Procedure 3 — Conclude an active meeting
    1. Navigate to 'Conclude' in the L10 meeting menu.
    2. Click 'Conclude Level 10'.
    3. Wait for the 'Conclude this Level 10?' dialog, then click 'Conclude Level 10' to confirm.
    4. The meeting is concluded once the 'Complete recap' screen appears.
  Procedure 4 — Add Issue
    1. Type issue name in the input field.
    2. Click button to add issue.
  Procedure 5 — Solve Issue
    1. Klick on line with IDS name in the IDS list. The issue details should be visible.
    2. Click Solve button.
    Procedure 6 — Kill Issue
    1. Klick on line with IDS name in the IDS list. The issue details should be visible.
    2. Click Kill button. The issue should NOT be wisible after killing.
OUTPUT FORMAT — STRICT
Respond with ONLY a valid JSON array. No markdown, no code fences, no commentary before or after — your entire response must be parseable as JSON.
Each array element is an object with exactly these 3 keys, in this exact order:
- "stepDescription": string — the action to perform.
- "stepExpectedResult": string — what should happen if the bug is fixed.
- "sessionID": the id string \`{{node:http-1.response.sessionID}}\` — copy it unchanged into every object; never generate, alter, or infer a value for it.
Example output:
[{"stepDescription":"Open the login page","stepExpectedResult":"Login page loads without errors","sessionID":"{{node:http-1.response.sessionID}}"}]
REMINDER: Output only the JSON array. No text before or after it.`,
      userPrompt: `Bug Summary: {{node:js-extract-desc.output.summary}}

Bug Description:
{{node:js-extract-desc.output.description}}

Bug Comments:
{{node:js-extract-comment.output}}

First page screenshot:
{{node:http-1.response.screenshots.screenshot}}

Generate the test steps JSON array now.`,
      temperature: 0.3,
    },
  },
  {
    id: 'orchestrator',
    type: 'llm',
    data: {
      provider: 'openai',
      model: 'gpt-4o',
      maxMessages: 20,
      maxToolCalls: 15,
      systemPrompt:
        "You are a test orchestrator. You get an array of test steps, expected results and sessionIDs. Execute each step by calling the step_execution tool. Wait for result before proceeding to next step. If the status in the result is 'test_broken', try to rerun the step once. If still 'test_broken' after the rerun, stop test execution. If you get 'failed' status, stop test execution. Return the array with the results of executed steps you get from tool.",
      userPrompt: '{{node:llm-generate-steps.response}}',
      tools: [
        {
          type: 'agent',
          agentId: '{{AGENT_ID:Test Step Executor}}',
          name: 'step_execution',
          description: 'single test step execution tool',
          parameters: {
            type: 'object',
            properties: {
              sessionID: {
                type: 'string',
                description: 'sessionID, same value for all steps in one test. Requered.',
              },
              testStepDescription: {
                type: 'string',
                description: 'Test step action description , plain text',
              },
              testStepExpectedResult: {
                type: 'string',
                description: 'Expexted result of the test step, plain text',
              },
            },
            required: ['sessionID', 'testStepDescription', 'testStepExpectedResult'],
          },
        },
      ],
    },
  },
  {
    id: 'js-build-comment',
    type: 'js',
    data: {
      input: '{{node:orchestrator.response}}',
      code: "const text = typeof input === 'string' ? input : JSON.stringify(input, null, 2); const commentBody = JSON.stringify({ body: text }); return { commentBody };",
    },
  },
  {
    id: 'http-jira-comment',
    type: 'http',
    data: {
      method: 'POST',
      url: 'https://{{node:input-1.jiraSubdomain}}.atlassian.net/rest/api/2/issue/{{node:input-1.jiraId}}/comment',
      headers: {
        Authorization: 'Basic {{secret:Jira_auth}}',
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: '{{node:js-build-comment.output.commentBody}}',
      persistedFields: ['url', 'status'],
    },
  },
  {
    id: 'output-1',
    type: 'output',
    data: {
      value: '{{node:orchestrator.toolCalls}}',
    },
  },
];

export const TEST_ORCHESTRATOR = {
  name: 'Test Orchestrator',
  description:
    'Generates test steps from a Jira ticket and executes them sequentially via the Test Step Executor sub-agent',
  nodes: TEST_ORCHESTRATOR_NODES,
  // Dependency: This agent requires Test Step Executor to be created first
  dependsOn: ['Test Step Executor'],
};
