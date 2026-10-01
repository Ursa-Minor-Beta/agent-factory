/**
 * Test Orchestrator - Generates test steps from Jira ticket and executes them via sub-agent
 * Note: The agentId placeholder '{{AGENT_ID:Test Step Executor}}' is replaced during seeding
 */

import type { WorkflowNode } from '../../../domain/entities/Agent.js';

export const TEST_ORCHESTRATOR_NODES: WorkflowNode[] = [
  {
    id: 'input',
    type: 'input',
    data: {
      schema: {
        url: {
          type: 'string',
          required: true,
          default: 'https://test.ai/',
        },
        jiraId: {
          type: 'string',
          required: true,
        },
        jiraEmail: {
          type: 'string',
          required: false,
          default: 'test@test.ai',
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
    id: 'http-0',
    type: 'http',
    data: {
      method: 'POST',
      url: '{{node:input.baasHost}}/api/async/start',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer {{secret:BAAS_API_KEY}}',
      },
      body: '{"browser":{"timeout": "1200s"}, "hold": false}',
    },
  },
  {
    id: 'http-1',
    type: 'http',
    data: {
      method: 'POST',
      url: '{{node:input.baasHost}}/api/async/message',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer {{secret:BAAS_API_KEY}}',
      },
      body: '{"program":"navigate(\'{{node:input.url}}\'); sleep(\'3s\'); waitReady(\'form\',\'timeout:20s\'); click(\'input[type=email]\'); sendKeysToElement(\'input[type=email]\',\'testkatja@testkatja.me\'); sleep(\'1s\'); click(\'button[type=submit]\'); waitReady(\'input[type=password]\',\'timeout:20s\'); click(\'input[type=password]\'); sendKeysToElement(\'input[type=password]\',\'Test1234!\'); click(\'button[type=submit]\'); sleep(\'10s\'); takeScreenshot(\'screenshot\', \'timeout:10s\');", "sessionID": "{{node:http-0.response.result.sessionID}}", "stopSession": false}',
      persistedFields: ['body', 'sseEvents', 'responseHeaders'],
    },
  },
  {
    id: 'js-fix-id',
    type: 'js',
    data: {
      input: '{{node:http-1.response}}',
      code: "if (typeof input === 'string') { output = JSON.parse(input) } else { output = input };",
    },
  },
  {
    id: 'http-jira',
    type: 'http',
    data: {
      method: 'GET',
      url: 'https://jira.atlassian.net/rest/api/2/issue/{{node:input.jiraId}}',
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
      url: 'https://jira.atlassian.net/rest/api/2/issue/{{node:input.jiraId}}/comment',
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
      model: 'gpt-4.1',
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
    1. Click 'Meetings' on the main menu. The initial meeting page appears, showing an empty calendar.
    2. Click 'Start L10' in the top right. Participants list appear and \`Start\` meeting button is visible.
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
    4. The meeting is concluded once the 'Past L10 meetings' tab appears.
  Procedure 4 — Add Issue
    1. Type issue name in the input field.
    2. Click button to add issue.
  Procedure 5 — Solve Issue
    1. Klick on line with IDS name in the IDS list. The issue details should be visible.
    2. Click Solve button.
    Procedure 6 — Kill Issue
    1. Klick on line with IDS name in the IDS list. The issue details should be visible.
    2. Click Kill button. The issue should NOT be wisible after killing.
    Procedure 6 — Add ToDo during the meeting
    1. Click 'New To-Do button.
    2. Fill nn Title field.
    3. Fill in Description field.
    4. Click 'Create To-Do' button and wait for 15 seconds. You should see your ToDo in \`New commitments\` section.
    Procedure 7 — Mark person 'Absent' in the participants list.
    1. Click the dot next to participant name. Dropdown with presence should be opened.
    2. Click on 'Absent' in the dropdown list.
    Procedure 8 — Open user profile
    1. Click on the user name at bottom left corner.
    2. Click on 'My profile' button in the dropdown menu.
    OUTPUT FORMAT — STRICT
    Respond with ONLY a valid JSON array. No markdown, no code fences, no commentary before or after — your entire response must be parseable as JSON.
    Each array element is an object with exactly these 3 keys, in this exact order:
    - "stepDescription": string — the action to perform.
- "stepExpectedResult": string — what should happen if the bug is fixed.
- "sessionID": the id string {{node:js-fix-id.output.sessionID}} — copy it unchanged into every object; never generate, alter, or infer a value for it.
Example output:
[{"stepDescription":"Open the login page","stepExpectedResult":"Login page loads without errors","sessionID":"{{node:js-fix-id.output.sessionID}}"}]
REMINDER: Output only the JSON array. No text before or after it.`,
      userPrompt: `Bug Summary: {{node:js-extract-desc.output.summary}}

Bug Description:
{{node:js-extract-desc.output.description}}

Bug Comments:
{{node:js-extract-comment.output}}

First page screenshot:
{{node:js-fix-id.output.screenshots.screenshot}}

Generate the test steps JSON array now.`,
      temperature: 0.3,
      maxTokens: 32000,
    },
  },
  {
    id: 'orchestrator',
    type: 'llm',
    data: {
      provider: 'openai',
      model: 'gpt-4.1',
      maxMessages: 20,
      maxToolCalls: 20,
      maxTokens: 32000,
      systemPrompt:
        "You are a test orchestrator. You get an array of test steps, expected results and sessionIDs. Execute each step by calling the step_execution tool. Wait for result before proceeding to next step. If the status in the result is 'test_broken', try to rerun the step once. If still 'test_broken' after the rerun, stop test execution. If you get 'failed' status, stop test execution. Return the array with the results of executed steps you get from tool.",
      userPrompt: '{{node:llm-generate-steps.response}}',
      tools: [
        {
          type: 'agent',
          agentId: '{{AGENT_ID:Test Step Executor}}',
          name: 'step_execution_v2',
          description: 'single test step execution tool',
          parameters: {
            type: 'object',
            properties: {
              sessionID: {
                type: 'string',
                description: 'SessionIDs, same value for all steps in one test. Requered.',
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
      url: 'https://jira.atlassian.net/rest/api/2/issue/{{node:input.jiraId}}/comment',
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
    id: 'js-check-success',
    type: 'js',
    data: {
      input: '{{node:orchestrator.toolCalls}}',
      code: "const calls = Array.isArray(input) ? input : (input && input.toolCalls) || []; const last = calls.length ? calls[calls.length - 1] : null; let status = null; if (last) { const res = last.result || last.output || {}; status = (res.Result && res.Result.status) || res.status || null; } return { success: status === 'success', status };",
    },
  },
  {
    id: 'branch-success',
    type: 'branch',
    data: {
      input: '{{node:js-check-success.output}}',
      branches: [
        {
          name: 'pass',
          condition: 'input.success === true',
          nodes: ['http-jira-transitions', 'js-find-transition', 'http-jira-set-done', 'output'],
        },
        {
          name: 'fail',
          condition: 'input.success === false',
          nodes: ['output'],
        },
      ],
    },
  },
  {
    id: 'http-jira-transitions',
    type: 'http',
    data: {
      method: 'GET',
      url: 'https://jira.atlassian.net/rest/api/2/issue/{{node:input.jiraId}}/transitions',
      headers: {
        Authorization: 'Basic {{secret:Jira_auth}}',
        Accept: 'application/json',
        'X-Gate': '{{node:branch-success.pass}}',
      },
      persistedFields: ['url', 'status'],
    },
  },
  {
    id: 'js-find-transition',
    type: 'js',
    data: {
      input: '{{node:http-jira-transitions.response}}',
      code: "const transitions = (input && input.transitions) || []; const done = transitions.find(t => (t.name || '').toLowerCase() === 'done' || (t.to && t.to.name && t.to.name.toLowerCase() === 'done')); return { transitionId: done ? done.id : null };",
    },
  },
  {
    id: 'http-jira-set-done',
    type: 'http',
    data: {
      method: 'POST',
      url: 'https://jira.atlassian.net/rest/api/2/issue/{{node:input.jiraId}}/transitions',
      headers: {
        Authorization: 'Basic {{secret:Jira_auth}}',
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: '{"transition": {"id": "{{node:js-find-transition.output.transitionId}}"}}',
      persistedFields: ['url', 'status', 'body'],
    },
  },
  {
    id: 'http-last',
    type: 'http',
    data: {
      method: 'POST',
      url: '{{node:input.baasHost}}/api/async/stop',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer {{secret:BAAS_API_KEY}}',
        'X-Gate': '{{node:branch-success.activeBranch}}',
      },
      body: '{"sessionID":"{{node:js-fix-id.output.sessionID}}"}',
    },
  },
  {
    id: 'output',
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
