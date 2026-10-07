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
} from '../entities/AgentExport.js';
import { AGENT_EXPORT_VERSION } from '../entities/AgentExport.js';
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
 * Recursively collect all agent IDs needed for export
 */
async function collectDependencyAgentIds(
  startAgent: Agent,
  agentRepo: IAgentRepository
): Promise<Map<string, Agent>> {
  const agentsMap = new Map<string, Agent>();
  agentsMap.set(startAgent.id, startAgent);

  const pendingIds = new Set<string>(
    extractAgentIdsFromNodes(startAgent.nodes).filter((id) => id !== startAgent.id)
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
function topologicalSortAgents(agents: Map<string, Agent>, mainAgentId: string): Agent[] {
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

  // Start from main agent - this will visit all reachable dependencies
  visit(mainAgentId);

  return result;
}

/**
 * Analyze all agents for export metadata using stringify + regex
 */
function analyzeAgents(agents: Map<string, Agent>, analysis: ExportAnalysis): void {
  /** Combined pattern for export analysis: secrets, providers, collections */
  const EXPORT_PATTERN = /\{\{secret:(\w+)\}\}|"provider":"([^"]+)"|"collection":"([^"]+)"/g;

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
    }
  }
}


/**
 * Convert Agent to ExportedAgent (strip user-specific data)
 */
function toExportedAgent(agent: Agent): ExportedAgent {
  return {
    name: agent.name,
    description: agent.description,
    nodes: agent.nodes,
    originalId: agent.id,
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

  // 3. Collect only needed agents (main + dependencies)
  const agentsMap = await collectDependencyAgentIds(mainAgent, deps.agentRepo);

  // 4. Analyze dependencies
  const analysis: ExportAnalysis = {
    collectionNames: new Set<string>(),
    secretNames: new Set<string>(),
    providerTypes: new Set<ProviderType>(),
  };

  analyzeAgents(agentsMap, analysis);

  // 5. Load collections (include not-found with just name)
  const workspaceIds: (string | null)[] = mainAgent.workspaceId
    ? [mainAgent.workspaceId, null]
    : [null];

  const collectionNames = Array.from(analysis.collectionNames);
  console.log('[export] Looking for collections:', collectionNames, 'in workspaces:', workspaceIds, 'for user:', userId);
  const schemas = await Promise.all(
    collectionNames.map((name) => deps.memorySchemaRepo.findByName(userId, name, workspaceIds))
  );
  console.log('[export] Found schemas:', schemas.map(s => s ? { name: s.name, id: s.id } : null));

  const collections = collectionNames.map((name, i) => toExportedCollection(name, schemas[i] ?? null));

  // 6. Build dependency list (topologically sorted, excluding main agent)
  const sortedAgents = topologicalSortAgents(agentsMap, mainAgent.id);
  const dependencies = sortedAgents
      .filter((a) => a.id !== mainAgent.id)
      .map(toExportedAgent);

  // 7. Build secrets list
  const secrets: RequiredSecret[] = Array.from(analysis.secretNames).map(
    (name) => ({ name })
  );

  console.log('[export] Found schemas:', schemas.map(s => s ? { name: s.name, id: s.id } : null));

  // 8. Build export package
  return {
    version: AGENT_EXPORT_VERSION,
    exportedAt: new Date(),
    workspace: {
      name: workspace?.name ?? mainAgent.name,
      description: workspace?.description,
    },
    agent: toExportedAgent(mainAgent),
    dependencies,
    collections,
    secrets,
    providers: Array.from(analysis.providerTypes),
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

  // Validate workspace
  const ws = pkg.workspace as Record<string, unknown>;
  if (typeof ws.name !== 'string') return false;

  // Validate main agent
  const agent = pkg.agent as Record<string, unknown>;
  if (typeof agent.name !== 'string') return false;
  if (!Array.isArray(agent.nodes)) return false;

  return true;
}
