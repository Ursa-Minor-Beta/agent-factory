import type { NodeType } from '../../domain/entities/Agent.js';
import { BaseNode } from './base.js';
import { InputNode } from './input.js';
import { OutputNode } from './output.js';
import { JsNode } from './js.js';
import { LlmNode } from './llm/index.js';
import { HttpNode } from './http.js';
import { AgentNode } from './agent.js';
import { IfElseNode } from './if-else.js';
import {
  MemoryStoreNode,
  MemorySearchNode,
  MemoryUpdateNode,
  MemoryDeleteNode,
} from './memory/index.js';

export { BaseNode } from './base.js';
export type { NodeExecutionResult, ProviderConfig, ExecutionOptions } from './base.js';

// Node registry
const nodeRegistry = new Map<NodeType, BaseNode>();

nodeRegistry.set('input', new InputNode());
nodeRegistry.set('output', new OutputNode());
nodeRegistry.set('js', new JsNode());
nodeRegistry.set('llm', new LlmNode());
nodeRegistry.set('http', new HttpNode());
nodeRegistry.set('agent', new AgentNode());
nodeRegistry.set('if-else', new IfElseNode());
nodeRegistry.set('memory-store', new MemoryStoreNode());
nodeRegistry.set('memory-search', new MemorySearchNode());
nodeRegistry.set('memory-update', new MemoryUpdateNode());
nodeRegistry.set('memory-delete', new MemoryDeleteNode());

export function getNode(type: NodeType): BaseNode {
  const node = nodeRegistry.get(type);
  if (!node) {
    throw new Error(`Unknown node type: ${type}`);
  }
  return node;
}

export { nodeRegistry };
