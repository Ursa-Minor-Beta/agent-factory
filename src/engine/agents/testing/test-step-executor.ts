/**
 * Test Step Executor - Executes a single test step via BaaS and evaluates the result
 */

import type { WorkflowNode } from '../../../domain/entities/Agent.js';

export const TEST_STEP_EXECUTOR_NODES: WorkflowNode[] = [
  {
    id: 'input-1',
    type: 'input',
    data: {
      schema: {
        sessionID: {
          type: 'string',
          required: true,
        },
        testStepDescription: {
          type: 'string',
          required: true,
        },
        testStepExpectedResult: {
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
    id: 'http-1',
    type: 'http',
    data: {
      method: 'POST',
      url: '{{node:input-1.baasHost}}/api/async/message',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer {{secret:BAAS_API_KEY}}',
      },
      body: '{"program":"takeScreenshot(\'screenshot\', \'timeout:10s\'); innerHtml(\'body\', \'timeout:10s\')","sessionID": "{{node:input-1.sessionID}}", "stopSession": false}',
      persistedFields: ['body', 'sseEvents'],
    },
  },
  {
    id: 'http-2',
    type: 'http',
    data: {
      method: 'GET',
      url: '{{node:input-1.baasHost}}/api/async/actions',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer {{secret:BAAS_API_KEY}}',
      },
    },
  },
  {
    id: 'llm-0',
    type: 'llm',
    data: {
      provider: 'openai',
      model: 'gpt-4o',
      systemPrompt: `You are expiriences QA with great understanding of EOS and L10 meetings. You have a task, an expectations and a screenshot of a page you are on right now. Please write a test step and expected result needed to verify the EOS platform behaviour. Be as specific as possible, mention what buttons should be clicked, the exact elemet that should be selected and so on.
EOS platform behaviour specifics:
 - When To-Do is marked as raised to IDS, it is only visible an 'In IDS' button instead of 'Raise Issue' button.
 IMPORTANT: response ONLY with test step and expected result as JSON with with exactly 2 keys:"stepDescription" (the action to perform), "stepExpectedResult" (what should happen if the bug is fixed). Bad example: {"stepDescription":"Click the 'Raise Issue' button on one of the to-dos","stepExpectedResult":"The selected to-do is marked as raised to IDS"}, Good example: {"stepDescription":"Click the 'Raise Issue' button on 'make baas better' to-do ","stepExpectedResult":"The 'make baas better' toDo is marked as raised to IDS"}`,
      userPrompt:
        '<task> {{node:input-1.testStepDescription}}</task>\n<expectations> {{node:input-1.testStepExpectedResult}}</expectations>\n <screenshot>: {{node:http-1.response.screenshots.screenshot}} </screenshot>',
      temperature: 0.7,
      maxTokens: 10000,
      persistedFields: ['userPrompt'],
    },
  },
  {
    id: 'js-0',
    type: 'js',
    data: {
      input: '{{node:llm-0.response}}',
      code: "if (typeof input === 'string') { const cleanString = input.replace(/\\n/g, ''); try {  output = JSON.parse(cleanString);} catch (e) {  output = { error: 'Invalid JSON format', details: e.message };  }} else if (input && typeof input === 'object') { output = input; } else { output = { error: 'Unsupported input type', details: typeof input };}",
    },
  },
  {
    id: 'llm-1',
    type: 'llm',
    data: {
      provider: 'openai',
      model: 'gpt-4o',
      role: 'assistant',
      content: "sleep('1s'); ",
      systemPrompt: `You are an expert at writing JS-like code that controls a browser. Given a task and the HTML of the currently open page, you emit a JS program that performs the task.
 You may ONLY use the functions described in this JSON. No other functions, no standard JS library calls: {{node:http-2.output}}
 OPTIONS
 Every function accepts extra string arguments of the form '<optionName>:<optionValue>'.
 Supported: 'timeout:10s' (Go duration format), 'selector:<css selector>'.
 Add a timeout option to every wait function.
 NAVIGATION
 - The browser is already open on a page. Do NOT navigate unless the task asks you to.
 - If asked to navigate, only open the URL. Do not log in, do not fill forms.
 - Always use navigateStatus, never navigate. Assign it to a variable and check it with if. Never use the || operator.
 var status = navigateStatus('https://example.com'); if (status != 200) { throw 'got ' + status; }
 - Always sleep after navigating, clicking, or submitting.
 - When you need to navidate inside main menu, use clickN(\`nav>a\`, N) where N starts from 0.
 - When you need to navigate inside the active L10 meeting, use clickN(\`button[data-slot="tooltip-trigger"]\`, N) where N starts from 0.
 WAITING
 - Waiting for a specific text: waitForText or waitForHtml, not waitReady.
 - Only checking whether text exists (no waiting needed): isTextPresent.
 - Reading text: text or llmText. Never read text through selectors.
 - waitReady is for generic page readiness only.
 SELECTORS
 - Prefer HTML/CSS locators. Use llm-based functions only when no locator can be found.
 - Never use llmClick or llmClickElement for login buttons.
 - Never invent a selector. If you do not know it, use llmClickElement (not llmClick) with the specific HTML tag.
 - Use attribute selectors only when the attribute is visible in the HTML.
 - NEVER use selectors like \`a:contains(<text>)\`, \`button[<text>]\` or \`a:has-text(<text>)\`. These selectors will never work.
 - When clicking an element identified by its text, infer the likely tag from context: it may be a, div, span, button, etc.
 - When you need to click on IDS name in the list, use clickN(\`section>div\`, N).
 INTERACTION
 - Use id locator if element has it, for example: \`button[id="<uniq number here>"]\`
 - Use clickN(selector, N) when the selector could match several elements. Count elements starting from 0! Check all HTML from the beginning to find correct N. Use click(selector) only when the selector is unique, e.g. an exact href.
 - Prefer clicking a button over submitting a form.
 - Always click an element before sending keys to it.
 - Use sendKeysToElement, never sendKeys.
 WHEN THE ELEMENT IS NOT IN THE HTML
 Do not explain, do not search out loud, do not report that you could not find it. Emit llmClickElement('<visible text>', '<likely tag>'); and continue.
 WHEN NO ACTION IS NEEDED
 If the page is already in the requested state, the whole response is: takeScreenshot('screenshot', 'timeout:10s'); sleep('3s');
 OUTPUT
 - One single line. No line breaks anywhere.
 - No template literals. Escape double quotes with a backslash.
 - Every response starts with takeScreenshot('screenshot', 'timeout:10s'); and ends with sleep('3s');`,
      userPrompt:
        '<task> {{node:js-0.output.stepDescription}}</task>\n <html>: {{node:http-1.response.outHtml}} </html>',
      temperature: 0.7,
      maxTokens: 10000,
      persistedFields: ['userPrompt'],
    },
  },
  {
    id: 'js-1',
    type: 'js',
    data: {
      input: '{{node:llm-1.response}}',
      code: 'const escaped = JSON.stringify(input); output = escaped.slice(1, -1);',
    },
  },
  {
    id: 'http-3',
    type: 'http',
    data: {
      method: 'POST',
      url: '{{node:input-1.baasHost}}/api/async/message',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer {{secret:BAAS_API_KEY}}',
      },
      body: '{"program":"{{node:js-1.output}} sleep(\'5s\'); takeScreenshot(\'screenshot\', \'timeout:10s\');","sessionID": "{{node:http-1.response.sessionID}}", "stopSession": false}',
      persistedFields: ['body', 'sseEvents'],
    },
  },
  {
    id: 'llm-2',
    type: 'llm',
    data: {
      provider: 'openai',
      model: 'gpt-4o',
      systemPrompt: `You are an experienced QA engineer with deep understanding of EOS (Entrepreneurial Operating System) and L10 meetings.
 You will be given:
 1. A test step description (context for what the tester was trying to do)
 2. The expected result of that test step
 3. A screenshot of the actual result
 # Your Task
 Compare the screenshot against the expected result, using the test step description as context. Decide whether the test succeeded, failed, or is broken, following the rules below. Then write a comment explaining your decision.
# Domain Rules
- **General principle — judge the end state, not the literal action.** Many test steps describe an action whose purpose is to reach a particular state (e.g., 'resume the meeting,' 'return to meeting', 'open the Issues tab'). If the screenshot shows that the described end state is ALREADY true — regardless of whether you can see the click/transition itself happening — treat the step as successful. The screenshot is evidence of a state, not a video of an action; do not fail a step just because you can't visually confirm a button was clicked, if the resulting state matches what that click was meant to achieve.
  - Example: if the step says 'resume the meeting' and the meeting is already active (no resume needed), mark it passed.
  - Example: if the step says 'click \`Return to meeting\`' and the screenshot shows the user is already inside the active meeting view (timer + Pause button visible), mark it passed — the goal state of 'being back in the meeting' is satisfied.
- A meeting is ACTIVE if a timer and a 'Pause' button are visible.
- A meeting is PAUSED if a 'Resume' button is visible (this is the pause indicator).
- 'IDS' and 'Issues' refer to the same — treat these names as interchangeable.
 # Status Decision Rules (check in this order)
1. **broken** — You cannot understand the test description, OR the screenshot is missing/empty/unreadable.
2. **test_broken** — The test description/expected result is itself flawed or inconsistent (e.g., a required input field is empty when it should have been filled in as a precondition — this is a strong signal for test_broken).
3. **success** — The screenshot shows the expected end state was reached, per the 'judge the end state' principle above — even if the literal button-click isn't visible in the screenshot.
4. **failed** — The page shows an unexpected error message, or the actual end state genuinely does not match the expected result (not just 'the click isn't visible').
 # Output Format
 Return exactly one raw JSON object. No arrays, no markdown, no code fences, no triple backticks, no extra text before or after.
 {
   "status": "success | failed | broken | test_broken",
   "comment": "Detailed explanation of why you reached this decision, referencing what you saw in the screenshot vs. the expected result."}`,
      userPrompt:
        'Test step description: {{node:js-0.output.stepDescription}}. Test step expected result: {{node:js-0.output.stepExpectedResult}},  The Screenshot: {{node:http-3.response.screenshots.screenshot}}',
      temperature: 0.7,
    },
  },
  {
    id: 'output-1',
    type: 'output',
    data: {
      stepDescription: '{{node:js-0.output.stepDescription}}',
      Result: '{{node:llm-2.response}}',
      Browser_program: '{{node:llm-1.response}}',
    },
  },
];

export const TEST_STEP_EXECUTOR = {
  name: 'Test Step Executor',
  description:
    'Executes a single test step using BaaS, generates browser code, and evaluates the result',
  nodes: TEST_STEP_EXECUTOR_NODES,
};
