/**
 * Agent Export Service - Handles exporting agents with all dependencies
 */

import type { Agent, WorkflowNode } from '../entities/Agent.js';
import type { MemorySchema } from '../entities/Memory.js';
import { PROVIDER_TYPES, type ProviderType } from '../entities/ProviderConfig.js';
import type { Workspace } from '../entities/Workspace.js';
import type {
  AgentExport,
  ExportedAgent,
  ExportedCollection,
  ExportAnalysis,
  RequiredSecret,
  RequiredVariable,
  WorkspaceExport,
} from '../entities/AgentExport.js';
import { AGENT_EXPORT_VERSION, WORKSPACE_EXPORT_VERSION } from '../entities/AgentExport.js';
import { NotFoundError, ForbiddenError } from '../../utils/errors.js';
import type { IAgentRepository } from '../interfaces/repositories/IAgentRepository.js';
import type { IWorkspaceRepository } from '../interfaces/repositories/IWorkspaceRepository.js';
import type { IMemorySchemaRepository } from '../interfaces/repositories/IMemorySchemaRepository.js';

export interface ExportServiceDependencies {
  agentRepo: IAgentRepository;
  workspaceRepo: IWorkspaceRepository;
  memorySchemaRepo: IMemorySchemaRepository;
}

/**
 * Extract agent IDs referenced in nodes (agent nodes + LLM tool agents)
 */
function extractAgentIdsFromNodes(nodes: WorkflowNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    // Agent node - direct reference
    if (node.type === 'agent' && node.data.agentId) {
      ids.push(node.data.agentId as string);
    }
    // LLM node - check tools for agent references
    if (node.type === 'llm' && Array.isArray(node.data.tools)) {
      for (const tool of node.data.tools as Array<{ type?: string; agentId?: string }>) {
        if (tool.type === 'agent' && tool.agentId) {
          ids.push(tool.agentId);
        }
      }
    }
  }
  return ids;
}

/**
 * Generate unique refId from agent name
 */
function generateUniqueRefId(name: string, usedRefIds: Set<string>): string {
  const formattedame = name.toLowerCase().replaceAll(' ', '-');
  let refId = formattedame;
  let n = 0;
  while (usedRefIds.has(refId)) {
    n++;
    refId = `${formattedame}-${n}`;
  }
  usedRefIds.add(refId);
  return refId;
}

/**
 * Replace agent ID references in nodes with refIds
 */
function replaceAgentIdsInNodes(nodes: WorkflowNode[], idToRefId: Map<string, string>): WorkflowNode[] {
  return nodes.map((node): WorkflowNode => {
    // Agent node - replace agentId reference
    if (node.type === 'agent' && node.data.agentId) {
      const refId = idToRefId.get(node.data.agentId as string);
      if (refId) {
        return {
          id: node.id,
          type: node.type,
          data: { ...node.data, agentId: refId },
        };
      }
    }

    // LLM node - replace agentId in tools
    if (node.type === 'llm' && Array.isArray(node.data.tools)) {
      const tools = (node.data.tools as Array<{ type?: string; agentId?: string }>).map((tool) => {
        if (tool.type === 'agent' && tool.agentId) {
          const refId = idToRefId.get(tool.agentId);
          if (refId) {
            return { ...tool, agentId: refId };
          }
        }
        return tool;
      });
      return {
        id: node.id,
        type: node.type,
        data: { ...node.data, tools },
      };
    }

    // No changes needed - return as is
    return node;
  });
}

/**
 * Recursively collect root agents and every agent they reference (across workspaces)
 */
async function collectDependencyAgentIds(
  rootAgents: Agent[],
  agentRepo: IAgentRepository
): Promise<Map<string, Agent>> {
  const agentsMap = new Map<string, Agent>();
  for (const agent of rootAgents) {
    agentsMap.set(agent.id, agent);
  }

  const pendingIds = new Set<string>(
    rootAgents.flatMap((agent) => extractAgentIdsFromNodes(agent.nodes)).filter((id) => !agentsMap.has(id))
  );

  // Recursively load referenced agents
  while (pendingIds.size > 0) {
    const idsToFetch = Array.from(pendingIds).filter((id) => !agentsMap.has(id));
    pendingIds.clear();
    if (idsToFetch.length === 0) break;

    const subAgents = await Promise.all(
      idsToFetch.map((id) => agentRepo.findById(id))
    );

    for (const subAgent of subAgents) {
      if (subAgent && !agentsMap.has(subAgent.id)) {
        agentsMap.set(subAgent.id, subAgent);
        // Check for more nested dependencies
        for (const id of extractAgentIdsFromNodes(subAgent.nodes)) {
          if (!agentsMap.has(id)) {
            pendingIds.add(id);
          }
        }
      }
    }
  }

  return agentsMap;
}

/**
 * Topologically sort agents so dependencies come before dependents
 * Uses DFS post-order traversal
 */
function topologicalSortAgents(agents: Map<string, Agent>, rootAgentIds: string[]): Agent[] {
  const result: Agent[] = [];
  const visited = new Set<string>();

  function visit(agentId: string): void {
    if (visited.has(agentId)) return;
    visited.add(agentId);

    const agent = agents.get(agentId);
    if (!agent) return;

    // Visit dependencies first
    for (const depId of extractAgentIdsFromNodes(agent.nodes)) {
      if (agents.has(depId)) {
        visit(depId);
      }
    }

    // Add after dependencies (post-order)
    result.push(agent);
  }

  // Start from root agents - this will visit all reachable dependencies
  rootAgentIds.forEach(visit);

  return result;
}

/**
 * Analyze all agents for export metadata using stringify + regex
 */
function analyzeAgents(agents: Map<string, Agent>, analysis: ExportAnalysis): void {
  /** Combined pattern for export analysis: secrets, providers, collections, variables */
  const EXPORT_PATTERN = /\{\{secret:(\w+)\}\}|"provider":"([^"]+)"|"collection":"([^"]+)"|\{\{var:(\w+)\}\}/g;

  for (const agent of agents.values()) {
    const agentStr = JSON.stringify(agent.nodes);

    for (const match of agentStr.matchAll(EXPORT_PATTERN)) {
      if (match[1]) {
        analysis.secretNames.add(match[1]);
      } 
      else if (match[2] && (PROVIDER_TYPES as readonly string[]).includes(match[2])) {
        analysis.providerTypes.add(match[2] as ProviderType);
      } 
      else if (match[3]) {
        analysis.collectionNames.add(match[3]);
      }
      else if (match[4]) {
        analysis.variableNames.add(match[4]);
      }
    }
  }
}


/**
 * Convert Agent to ExportedAgent (strip user-specific data, replace IDs with refIds)
 */
function toExportedAgent(agent: Agent, refId: string, idToRefId: Map<string, string>): ExportedAgent {
  return {
    refId,
    name: agent.name,
    description: agent.description,
    nodes: replaceAgentIdsInNodes(agent.nodes, idToRefId),
    editorData: agent.editorData,
    settings: agent.settings,
  };
}

/**
 * Convert MemorySchema to ExportedCollection (strip user-specific data)
 */
function toExportedCollection(name: string, schema: MemorySchema | null): ExportedCollection {
  return {
    name,
    schema: schema ? { description: schema.description, fields: schema.fields } : null,
  };
}

interface ExportParts {
  idToRefId: Map<string, string>;
  /** All agents (roots + dependencies), dependencies before dependents */
  sortedAgents: Agent[];
  collections: ExportedCollection[];
  secrets: RequiredSecret[];
  variables: RequiredVariable[];
  providers: ProviderType[];
}

/**
 * Collect dependencies and metadata shared by agent and workspace exports
 */
async function buildExportParts(
  rootAgents: Agent[],
  userId: string,
  workspaceId: string | undefined,
  deps: ExportServiceDependencies
): Promise<ExportParts> {
  // 1. Collect only needed agents (roots + dependencies)
  const agentsMap = await collectDependencyAgentIds(rootAgents, deps.agentRepo);

  // 2. Build ID to refId mapping (roots first so they get the base names)
  const usedRefIds = new Set<string>();
  const idToRefId = new Map<string, string>();
  for (const agent of [...rootAgents, ...agentsMap.values()]) {
    if (!idToRefId.has(agent.id)) {
      idToRefId.set(agent.id, generateUniqueRefId(agent.name, usedRefIds));
    }
  }

  // 3. Analyze dependencies
  const analysis: ExportAnalysis = {
    collectionNames: new Set<string>(),
    secretNames: new Set<string>(),
    variableNames: new Set<string>(),
    providerTypes: new Set<ProviderType>(),
  };

  analyzeAgents(agentsMap, analysis);

  // 4. Load collections (include not-found with just name)
  const workspaceIds: (string | null)[] = workspaceId ? [workspaceId, null] : [null];

  const collectionNames = Array.from(analysis.collectionNames);
  const schemas = await Promise.all(
    collectionNames.map((name) => deps.memorySchemaRepo.findByName(userId, name, workspaceIds))
  );

  return {
    idToRefId,
    sortedAgents: topologicalSortAgents(agentsMap, rootAgents.map((a) => a.id)),
    collections: collectionNames.map((name, i) => toExportedCollection(name, schemas[i] ?? null)),
    secrets: Array.from(analysis.secretNames).map((name) => ({ name })),
    variables: Array.from(analysis.variableNames).map((name) => ({ name })),
    providers: Array.from(analysis.providerTypes),
  };
}

/**
 * Export an agent with all its dependencies
 */
export async function exportAgent(
  agentId: string,
  userId: string,
  deps: ExportServiceDependencies
): Promise<AgentExport> {
  // 1. Load the main agent
  const mainAgent = await deps.agentRepo.findById(agentId);
  if (!mainAgent) {
    throw new Error(`Agent not found: ${agentId}`);
  }

  // Check ownership
  if (mainAgent.userId !== userId) {
    throw new Error('Access denied: Agent belongs to another user');
  }

  // 2. Get workspace info
  let workspace: Workspace | null = null;
  if (mainAgent.workspaceId) {
    workspace = await deps.workspaceRepo.findById(mainAgent.workspaceId);
  }

  // 3. Collect dependencies and metadata
  const parts = await buildExportParts([mainAgent], userId, mainAgent.workspaceId, deps);

  // 4. Build dependency list (topologically sorted, excluding main agent)
  const dependencies = parts.sortedAgents
    .filter((a) => a.id !== mainAgent.id)
    .map((a) => toExportedAgent(a, parts.idToRefId.get(a.id)!, parts.idToRefId));

  // 5. Build export package
  return {
    version: AGENT_EXPORT_VERSION,
    exportedAt: new Date(),
    workspace: {
      name: workspace?.name ?? mainAgent.name,
      description: workspace?.description,
    },
    agent: toExportedAgent(mainAgent, parts.idToRefId.get(mainAgent.id)!, parts.idToRefId),
    dependencies,
    collections: parts.collections,
    secrets: parts.secrets,
    variables: parts.variables,
    providers: parts.providers,
  };
}

/**
 * Export all agents of a workspace.
 * Agents from other workspaces referenced by them are included as regular agents,
 * so on import they are created inside the new workspace.
 */
export async function exportWorkspace(
  workspaceId: string,
  userId: string,
  deps: ExportServiceDependencies
): Promise<WorkspaceExport> {
  const workspace = await deps.workspaceRepo.findById(workspaceId);
  if (!workspace) {
    throw new NotFoundError('Workspace');
  }
  if (workspace.userId !== userId) {
    throw new ForbiddenError('Access denied');
  }

  const items = await deps.agentRepo.findGraphItems({ userId, workspaceId });
  const rootAgents = (await Promise.all(items.map((item) => deps.agentRepo.findById(item.id))))
    .filter((agent): agent is NonNullable<typeof agent> => agent !== null)
    .sort((a, b) => a.name.localeCompare(b.name));

  const parts = await buildExportParts(rootAgents, userId, workspaceId, deps);

  return {
    version: WORKSPACE_EXPORT_VERSION,
    exportedAt: new Date(),
    workspace: {
      name: workspace.name,
      description: workspace.description,
    },
    agents: parts.sortedAgents.map((a) => toExportedAgent(a, parts.idToRefId.get(a.id)!, parts.idToRefId)),
    collections: parts.collections,
    secrets: parts.secrets,
    variables: parts.variables,
    providers: parts.providers,
  };
}

/**
 * Validate an export package structure
 */
export function validateExportPackage(data: unknown): data is AgentExport {
  if (!data || typeof data !== 'object') {
    return false;
  }

  const pkg = data as Record<string, unknown>;

  // Check required fields
  if (typeof pkg.version !== 'string') return false;
  if (!pkg.exportedAt) return false;
  if (!pkg.workspace || typeof pkg.workspace !== 'object') return false;
  if (!pkg.agent || typeof pkg.agent !== 'object') return false;
  if (!Array.isArray(pkg.dependencies)) return false;
  if (!Array.isArray(pkg.collections)) return false;
  if (!Array.isArray(pkg.secrets)) return false;
  if (!Array.isArray(pkg.providers)) return false;
  if (pkg.variables !== undefined && !Array.isArray(pkg.variables)) return false;

  // Validate workspace
  const ws = pkg.workspace as Record<string, unknown>;
  if (typeof ws.name !== 'string') return false;

  // Validate main agent
  const agent = pkg.agent as Record<string, unknown>;
  if (typeof agent.name !== 'string') return false;
  if (!Array.isArray(agent.nodes)) return false;

  return true;
}

/**
 * Validate a workspace export package structure
 */
export function validateWorkspaceExportPackage(data: unknown): data is WorkspaceExport {
  if (!data || typeof data !== 'object') {
    return false;
  }

  const pkg = data as Record<string, unknown>;

  if (typeof pkg.version !== 'string') return false;
  if (!pkg.workspace || typeof pkg.workspace !== 'object') return false;
  if (typeof (pkg.workspace as Record<string, unknown>).name !== 'string') return false;
  if (!Array.isArray(pkg.agents)) return false;
  if (!Array.isArray(pkg.collections)) return false;
  if (!Array.isArray(pkg.secrets)) return false;
  if (!Array.isArray(pkg.providers)) return false;
  if (pkg.variables !== undefined && !Array.isArray(pkg.variables)) return false;

  return (pkg.agents as unknown[]).every((agent) => {
    const a = agent as Record<string, unknown> | null;
    return !!a && typeof a.refId === 'string' && typeof a.name === 'string' && Array.isArray(a.nodes);
  });
}
