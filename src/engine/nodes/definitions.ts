import { COMMON_NODE_FIELDS, type NodeDefinition, type NodeDefinitionRaw } from './definition.types.js';
import { INPUT_NODE_DEFINITION } from './input.definition.js';
import { OUTPUT_NODE_DEFINITION } from './output.definition.js';
import { LLM_NODE_DEFINITION } from './llm/llm.definition.js';
import { HTTP_NODE_DEFINITION } from './http.definition.js';
import { JS_NODE_DEFINITION } from './js.definition.js';
import { AGENT_NODE_DEFINITION } from './agent.definition.js';
import { BRANCH_NODE_DEFINITION } from './branch.definition.js';
import { MEMORY_STORE_NODE_DEFINITION } from './memory/store.definition.js';
import { MEMORY_SEARCH_NODE_DEFINITION } from './memory/search.definition.js';
import { MEMORY_UPDATE_NODE_DEFINITION } from './memory/update.definition.js';
import { MEMORY_DELETE_NODE_DEFINITION } from './memory/delete.definition.js';

export * from './definition.types.js';

/**
 * Node definitions registry. Each definition lives next to its node in `*.definition.ts`.
 */
const NODE_DEFINITIONS_RAW: NodeDefinitionRaw[] = [
  INPUT_NODE_DEFINITION,
  OUTPUT_NODE_DEFINITION,
  LLM_NODE_DEFINITION,
  HTTP_NODE_DEFINITION,
  JS_NODE_DEFINITION,
  AGENT_NODE_DEFINITION,
  BRANCH_NODE_DEFINITION,
  MEMORY_STORE_NODE_DEFINITION,
  MEMORY_SEARCH_NODE_DEFINITION,
  MEMORY_UPDATE_NODE_DEFINITION,
  MEMORY_DELETE_NODE_DEFINITION,
];

export const NODE_DEFINITIONS: NodeDefinition[] = NODE_DEFINITIONS_RAW.map( n => {
  const { statusText, ...rest } = n;
  // Output nodes always run last, so runAfter is meaningless there
  const nodeFields = rest.nodeFields ?? (rest.type === 'output' ? [] : COMMON_NODE_FIELDS);
  return { ...rest, nodeFields }
})

/**
 * Generate a text description of all node types for LLM prompts
 */
export function generateNodeDocsForPrompt(): string {
  const lines: string[] = ['## Available Node Types\n'];

  lines.push('Node-level fields (set next to id/type, not inside data; not available on output nodes):');
  for (const field of COMMON_NODE_FIELDS) {
    lines.push(`- ${field.name}: ${field.description}`);
  }
  lines.push('');

  for (const node of NODE_DEFINITIONS) {
    lines.push(`### ${node.type}`);
    lines.push(node.description);
    lines.push(`- Inputs: ${node.inputs.length ? node.inputs.join(', ') : 'none'}`);
    lines.push(`- Outputs: ${node.outputs.length ? node.outputs.join(', ') : 'none'}`);

    if (node.options.length) {
      lines.push('- Options:');
      for (const opt of node.options) {
        const req = opt.required ? ' (required)' : '';
        const def = opt.default !== undefined ? ` [default: ${JSON.stringify(opt.default)}]` : '';
        const vals = opt.values ? ` [values: ${opt.values.join('|')}]` : '';
        lines.push(`  - ${opt.name}: ${opt.description}${req}${def}${vals}`);
      }
    }

    const firstExample = node.examples?.[0];
    if (firstExample) {
      lines.push('- Example:');
      lines.push('```json');
      lines.push(JSON.stringify({
        id: firstExample.id,
        type: firstExample.type,
        data: firstExample.data,
        ...(firstExample.runAfter && { runAfter: firstExample.runAfter }),
      }, null, 2));
      lines.push('```');
    }

    lines.push('');
  }

  return lines.join('\n');
}

/** Map of node type to status text for fast lookup */
const NODE_STATUS_TEXT_MAP = new Map<string, string>(
  NODE_DEFINITIONS_RAW.map((def) => [def.type, def.statusText])
);

/**
 * Get the status text for a node type (used during execution)
 * @param nodeType - The node type to get status text for
 * @returns The human-readable status text, or 'Processing...' for unknown types
 */
export const getNodeStatusText = (nodeType: string): string =>
  NODE_STATUS_TEXT_MAP.get(nodeType) ?? 'Processing...';
