/**
 * Agent graph domain service
 * Extracts agent-to-agent references from workflow nodes and builds relation graphs
 */

import type { WorkflowNode, AgentReference, AgentGraphItem } from '../entities/Agent.js';

const TEMPLATE_PATTERN = /\{\{.*\}\}/;

function toAgentTarget(value: unknown): Pick<AgentReference, 'targetAgentId' | 'dynamic'> {
  const agentId = typeof value === 'string' ? value.trim() : '';
  if (!agentId || TEMPLATE_PATTERN.test(agentId)) {
    return { dynamic: true };
  }
  return { targetAgentId: agentId };
}

/**
 * Extract outgoing references (agent nodes, agent tools, builtin tools) from workflow nodes
 */
export function extractAgentReferences(nodes: WorkflowNode[] = []): AgentReference[] {
  const references: AgentReference[] = [];

  for (const node of nodes) {
    if (node.type === 'agent') {
      references.push({ kind: 'agent-node', nodeId: node.id, ...toAgentTarget(node.data?.agentId) });
      continue;
    }

    if (node.type !== 'llm' || !Array.isArray(node.data?.tools)) {
      continue;
    }

    for (const tool of node.data.tools as Array<Record<string, unknown>>) {
      if (tool?.type === 'agent') {
        references.push({
          kind: 'agent-tool',
          nodeId: node.id,
          toolName: typeof tool.name === 'string' ? tool.name : undefined,
          ...toAgentTarget(tool.agentId),
        });
      } 
      else if (tool?.type === 'builtin' && typeof tool.name === 'string') {
        references.push({ kind: 'builtin-tool', nodeId: node.id, toolName: tool.name });
      }
    }
  }

  return references;
}

export interface AgentGraphNode {
  id: string;
  name: string;
  workspaceId?: string;
  workspaceName?: string;
  /** Agent is outside the requested scope (other workspace, or not owned by the user for the all-agents graph) */
  external: boolean;
  /** Referenced agent no longer exists or is not accessible */
  missing?: boolean;
}

export interface AgentGraphEdge {
  from: string;
  /** Target agent id; absent for dynamic references */
  to?: string;
  kind: 'agent-node' | 'agent-tool';
  nodeId: string;
  toolName?: string;
  dynamic?: boolean;
}

export interface AgentGraphBuiltin {
  agentId: string;
  nodeId: string;
  toolName: string;
}

export interface AgentGraph {
  nodes: AgentGraphNode[];
  edges: AgentGraphEdge[];
  builtins: AgentGraphBuiltin[];
}

export interface AgentGraphDeps {
  /** Agents in scope (workspace agents, or all user agents) */
  findScopeAgents: () => Promise<AgentGraphItem[]>;
  /** Agents by id (any workspace) */
  findAgentsByIds: (ids: string[]) => Promise<AgentGraphItem[]>;
  /** Agents (outside the scope) that reference any of the given ids; omit to skip incoming callers */
  findCallers?: (targetIds: string[]) => Promise<AgentGraphItem[]>;
}

/**
 * Build the relation graph for a set of in-scope agents, including out-of-scope callees
 * (and out-of-scope callers when deps.findCallers is provided)
 */
export async function buildAgentGraph(deps: AgentGraphDeps): Promise<AgentGraph> {
  const scopeAgents = await deps.findScopeAgents();
  const scopeIds = scopeAgents.map((a) => a.id);
  const scopeIdSet = new Set(scopeIds);

  const callers = deps.findCallers
    ? (await deps.findCallers(scopeIds)).filter((a) => !scopeIdSet.has(a.id))
    : [];

  const known = new Map<string, AgentGraphItem>();
  for (const agent of [...scopeAgents, ...callers]) {
    known.set(agent.id, agent);
  }

  const unresolvedTargets = new Set<string>();
  for (const agent of scopeAgents) {
    for (const ref of agent.references ?? []) {
      if (ref.targetAgentId && !known.has(ref.targetAgentId)) {
        unresolvedTargets.add(ref.targetAgentId);
      }
    }
  }
  if (unresolvedTargets.size > 0) {
    for (const agent of await deps.findAgentsByIds([...unresolvedTargets])) {
      known.set(agent.id, agent);
    }
  }

  const nodes = new Map<string, AgentGraphNode>();
  const addNode = (id: string): void => {
    if (nodes.has(id)) return;
    const agent = known.get(id);
    nodes.set(id, agent
      ? {
        id,
        name: agent.name,
        workspaceId: agent.workspaceId,
        workspaceName: agent.workspaceName,
        external: !scopeIdSet.has(id),
      }
      : { id, name: id, external: true, missing: true });
  };

  const edges: AgentGraphEdge[] = [];
  const builtins: AgentGraphBuiltin[] = [];

  scopeAgents.forEach((a) => addNode(a.id));

  for (const agent of [...scopeAgents, ...callers]) {
    const isCaller = !scopeIdSet.has(agent.id);
    for (const ref of agent.references ?? []) {
      if (ref.kind === 'builtin-tool') {
        if (!isCaller && ref.toolName) {
          builtins.push({ agentId: agent.id, nodeId: ref.nodeId, toolName: ref.toolName });
        }
        continue;
      }
      // External callers only contribute edges into the scope
      if (isCaller && !(ref.targetAgentId && scopeIdSet.has(ref.targetAgentId))) {
        continue;
      }
      addNode(agent.id);
      if (ref.targetAgentId) addNode(ref.targetAgentId);
      edges.push({
        from: agent.id,
        to: ref.targetAgentId,
        kind: ref.kind,
        nodeId: ref.nodeId,
        toolName: ref.toolName,
        dynamic: ref.dynamic,
      });
    }
  }

  return { nodes: [...nodes.values()], edges, builtins };
}
