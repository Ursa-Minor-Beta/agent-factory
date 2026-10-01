/**
 * Test Step Executor - Executes a single test step via BaaS and evaluates the result
 */

import type { WorkflowNode } from '../../../domain/entities/Agent.js';

export const TEST_STEP_EXECUTOR_NODES: WorkflowNode[] = [
  {
    id: 'input',
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
      url: '{{node:input.baasHost}}/api/async/message',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer {{secret:BAAS_API_KEY}}',
      },
      body: '{"program":"takeScreenshot(\'screenshot\', \'timeout:10s\'); innerHtml(\'body\', \'timeout:10s\')","sessionID": "{{node:input.sessionID}}", "stopSession": false}',
      persistedFields: ['body', 'sseEvents'],
    },
  },
  {
    id: 'js-2',
    type: 'js',
    data: {
      input: '{{node:http-1.response}}',
      code: "if (typeof input === 'string') { output = JSON.parse(input) } else { output = input };",
    },
  },
  {
    id: 'http-2',
    type: 'http',
    data: {
      method: 'GET',
      url: '{{node:input.baasHost}}/api/async/actions',
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
      model: 'gpt-4.1',
      systemPrompt: `# Role
You are an experienced QA engineer with deep knowledge of the EOS (Entrepreneurial Operating System) platform and L10 meetings.
# Inputs
You will receive:
1. **Task**: the behavior or bug to verify.
2. **Expectations**: what should happen when the behavior works correctly (i.e., the bug is fixed).
3. **Screenshot**: the page currently open in the EOS platform.
# Workflow
Follow these steps in order. Do not skip any step.
## Step 1: Identify the starting page
Look at the screenshot and choose the page it shows. This is the initial page for the Page Object Pattern. You MUST choose exactly one value from this list, spelled exactly as written:
- My EOS
- Meetings
- Active Meeting
- Scorecard
- Rocks
- To-Dos
- Issues
- Headlines
- Vision / Traction Organizer
- Accountability Chart
- Process
- profile
- Admin
- Choose a company
If the screenshot is ambiguous, pick the page that best matches the main content.
## Step 2: Search memory for existing test steps
Call the \`memory_search\` tool with:
- collection: \`test_steps\`
- field: \`page\`
- query: the page name you chose in Step 1
You MUST call this tool before producing any output.
## Step 3: Check for a matching step
Compare each result's \`stepDescription\` and \`stepExpectedResult\` with the Task and Expectations.
A result counts as a match only if BOTH of these are true:
- It performs the same user action on the same type of element (e.g., clicking "Raise Issue" on a to-do).
- It verifies the same outcome described in the Expectations.
Differences in wording, or in the specific item name, do not prevent a match. A different action or a different expected outcome does.
- If a match exists: use that result's \`stepDescription\`, \`stepExpectedResult\`, and \`page\` exactly as stored, and set \`from_memory\` to \`true\`. If several match, use the closest one.
- If there is no match, or the search returns no results or an error: go to Step 4.
## Step 4: Write a new test step (only if there is no match)
Write one test step and one expected result that verify the Task. Set \`from_memory\` to \`false\` and \`page\` to the value from Step 1.
The step MUST be specific and executable. It should:
- Name the exact button, link, or control to click, using its visible label in single quotes (e.g., 'Raise Issue').
- Name the exact item to act on, using the text visible in the screenshot (e.g., the 'make baas better' to-do).
- State how many times to click or repeat an action if it is more than once.
- State any values to type or options to select.
The expected result MUST describe an observable UI change that confirms the fix, naming the specific element and its new state.
# EOS platform behavior rules
- When a To-Do has been raised to IDS, its 'Raise Issue' button is replaced by an 'In IDS' button. Only the 'In IDS' button is visible for that To-Do.
# Output format
Respond with ONLY a single JSON object. Do not add any text, explanation, or markdown code fences before or after it.
The object must have exactly these 4 keys:
- "stepDescription" (string): the action to perform.
- "stepExpectedResult" (string): what should happen if the bug is fixed.
- "page" (string): the starting page, one value from the list in Step 1.
- "from_memory" (boolean): true if the step came from \`memory_search\`, otherwise false.
# Examples
## Bad (too vague: says "one of the to-dos" and does not describe a visible change)
{"stepDescription": "Click the 'Raise Issue' button on one of the to-dos", "stepExpectedResult": "The selected to-do is marked as raised to IDS", "page": "Active Meeting", "from_memory": false}
## Good (names the exact item and the exact visible change)
{"stepDescription": "Click the 'Raise Issue' button on the 'make baas better' to-do once", "stepExpectedResult": "The 'make baas better' to-do shows an 'In IDS' button and the 'Raise Issue' button is no longer visible", "page": "Active Meeting", "from_memory": false}
# Final reminders
- Always call \`memory_search\` before answering.
- "page" must be exactly one value from the list in Step 1.
- "from_memory" must be a JSON boolean (true or false), not a string.
- Output only the JSON object and nothing else.`,
      userPrompt:
        '<task> {{node:input.testStepDescription}}</task>\n<expectations> {{node:input.testStepExpectedResult}}</expectations>\n <screenshot>: {{node:js-2.output.screenshots.screenshot}} </screenshot>',
      temperature: 0.7,
      maxTokens: 10000,
      tools: [
        {
          type: 'builtin',
          name: 'memory_search',
        },
      ],
      maxToolCalls: 2,
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
    id: 'branch-deside',
    type: 'branch',
    data: {
      input: '{{node:js-0.output}}',
      branches: [
        {
          name: 'found',
          condition: 'input.from_memory === true',
          nodes: ['memory-search-1', 'memory-delete-1'],
        },
        {
          name: 'create',
          condition: 'input.from_memory === false',
          nodes: ['llm-1', 'memory-store-1'],
        },
      ],
    },
  },
  {
    id: 'memory-search-1',
    type: 'memory-search',
    data: {
      collection: 'test_steps',
      filters: {
        page: '{{node:js-0.output.page}}',
        stepDescription: '{{node:js-0.output.stepDescription}}',
        stepExpectedResult: '{{node:js-0.output.stepExpectedResult}}',
      },
      limit: 1,
    },
  },
  {
    id: 'js-extract-program',
    type: 'js',
    data: {
      input: '{{node:memory-search-1.records}}',
      code: "output = (input && input[0] && input[0].program) ? input[0].program : '';",
    },
  },
  {
    id: 'llm-1',
    type: 'llm',
    data: {
      provider: 'openai',
      model: 'gpt-4.1',
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
 - When you need to navidate inside main menu, use clickN(\`nav>a\`, N) where N starts from 0.
 - When you need to navigate inside the active L10 meeting, use clickN(\`button[data-slot="tooltip-trigger"]\`, N) where N starts from 0, for example clickN(\`button[data-slot="tooltip-trigger"]\`, 3) to go to Headlines.
 - Always use navigateStatus, never navigate. Assign it to a variable and check it with if. Never use the || operator.
 var status = navigateStatus('https://example.com'); if (status != 200) { throw 'got ' + status; }
 - Always sleep after navigating, clicking, or submitting.
 - Never use nevidate when you need to click button.
 WAITING
 - Waiting for a specific text: waitForText or waitForHtml, not waitReady.
 - Only checking whether text exists (no waiting needed): isTextPresent.
 - Reading text: text or llmText. Never read text through selectors.
 - waitReady is for generic page readiness only.
 SELECTORS
 - Prefer HTML/CSS locators. Use llm-based functions only when no locator can be found.
 - Prefer to use \`id\` locator if the element have it.
 - Never use llmClick or llmClickElement for login buttons.
 - Never invent a selector. If you do not know it, use llmClickElement (not llmClick) with the specific HTML tag.
 - Use attribute selectors only when the attribute is visible in the HTML.
 - NEVER use selectors like \`a:contains(<text>)\`, \`button[<text>]\` or \`a:has-text(<text>)\`. These selectors will never work.
 - When clicking an element identified by its text, infer the likely tag from context: it may be a, div, span, button, etc.
 - When you need to click on IDS name in the list, use clickN(\`section>div\`, N). First issue in a list will be clickN(\`section>div\`, 2).
 - When ou need to click the dot next to participant name in the participant list, use clickN('button[data-slot="dropdown-trigger"]', N). First dot in a list will be clickN('button[data-slot="dropdown-trigger"]', 2).
 - When you need to click on \`Add to IDS\` button, use button[id="<insert actual id here>"].
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
        '<task> {{node:js-0.output.stepDescription}}</task>\n <html>: {{node:js-2.output.outHtml}} </html>',
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
      code: "if (input === null || input === undefined || input === '' || (typeof input === 'string' && /^\\{\\{node:.*\\}\\}$/.test(input))) { output = ''; } else { const escaped = JSON.stringify(input); output = escaped.slice(1, -1); }",
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
      body: '{"program":"{{node:js-1.output}} {{node:js-extract-program.output}} sleep(\'5s\'); takeScreenshot(\'screenshot\', \'timeout:10s\');","sessionID": "{{node:js-2.output.sessionID}}", "stopSession": false}',
      persistedFields: ['body', 'sseEvents'],
    },
  },
  {
    id: 'llm-2',
    type: 'llm',
    data: {
      provider: 'openai',
      model: 'gpt-4.1',
      systemPrompt: `You are an experienced QA engineer with deep understanding of EOS (Entrepreneurial Operating System) and L10 meetings.
You will be given:
1. A test step description (context for what the tester was trying to do)
2. The expected result of that test step
3. A screenshot before the test step execution
4. A screenshot of the actual result
# Your Task
From the \`Screenshot before test step\` guess the initial test page name for page object pattern, one of following: \`My EOS\`, \`Meetings\`, \`Active Meeting\`, \`Scorecard\`, \`Rocks\`, \`To-Dos\`, \`Issues\`, \`Headlines\`, \`Vision / Traction Organizer\`, \`Accountability Chart\`, \`Process\`, \`profile\`, \`Admin\`, \`Choose a company\`. Compare the screenshots against the expected result, using the test step description as context. Decide whether the test succeeded, failed, or is broken, following the rules below. Then write a comment explaining your decision.
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
{"stepDescription": "exact \`Test step description\` from user input",
  "status": "success | failed | broken | test_broken",
  "comment": "Detailed explanation of why you reached this decision, referencing what you saw in the screenshot vs. the expected result.",
  "page":"Test page name here"}`,
      userPrompt:
        'Test step description: {{node:js-0.output.stepDescription}}. Test step expected result: {{node:js-0.output.stepExpectedResult}},The Screenshot before test step: {{node:js-2.output.screenshots.screenshot}}  The Screenshot of the result: {{node:http-3.response.screenshots.screenshot}}',
      temperature: 0.7,
    },
  },
  {
    id: 'js-3',
    type: 'js',
    data: {
      input: '{{node:llm-2.response}}',
      code: "if (typeof input === 'string') { const cleanString = input.replace(/\\n/g, ''); try {  output = JSON.parse(cleanString);} catch (e) {  output = { error: 'Invalid JSON format', details: e.message };  }} else if (input && typeof input === 'object') { output = input; } else { output = { error: 'Unsupported input type', details: typeof input };}",
    },
  },
  {
    id: 'branch-delete',
    type: 'branch',
    data: {
      input: '{{node:js-3.output}}',
      branches: [
        {
          name: 'success',
          condition: "(input.status === 'success' || input.status === 'broken' )",
          nodes: ['memory-store-1', 'output-1'],
        },
        {
          name: 'failed',
          condition:
            "(input.status === 'test_broken' || input.status === 'broken' || input.status === 'failed')",
          nodes: ['memory-delete-1', 'output-1'],
        },
      ],
    },
  },
  {
    id: 'memory-store-1',
    type: 'memory-store',
    data: {
      collection: 'test_steps',
      data: {
        stepDescription: '{{node:js-3.output.stepDescription}}',
        stepExpectedResult: '{{node:js-0.output.stepExpectedResult}}',
        program: '{{node:js-1.output}}',
        page: '{{node:js-3.output.page}}',
      },
    },
  },
  {
    id: 'memory-delete-1',
    type: 'memory-delete',
    data: {
      some_val: '{{node:branch-delete.activeBranch}}',
      collection: 'test_steps',
      id: '{{node:memory-search-1.records.0.id}}',
    },
  },
  {
    id: 'output-1',
    type: 'output',
    data: {
      stepDescription: '{{node:js-0.output.stepDescription}}',
      Result: '{{node:llm-2.response}}',
      Browser_program: '{{node:js-1.output}}',
      Result_screenshot: '{{node:http-3.response.screenshots.screenshot}}',
    },
  },
];

export const TEST_STEP_EXECUTOR = {
  name: 'Test Step Executor',
  description:
    'Executes a single test step using BaaS, generates browser code, and evaluates the result',
  nodes: TEST_STEP_EXECUTOR_NODES,
};
