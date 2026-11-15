/**
 * Agent Import Service - Handles importing agents from export packages
 * Always creates a new workspace for isolation
 */

import type { WorkflowNode } from '../entities/Agent.js';
import type { AgentExport, ExportedAgent, ExportedCollection, WorkspaceExport } from '../entities/AgentExport.js';
import { validateExportPackage, validateWorkspaceExportPackage } from './agent-export.service.js';
import type { IAgentRepository } from '../interfaces/repositories/IAgentRepository.js';
import type { IWorkspaceRepository } from '../interfaces/repositories/IWorkspaceRepository.js';

export interface ImportServiceDependencies {
  agentRepo: IAgentRepository;
  workspaceRepo: IWorkspaceRepository;
}

export interface ImportOptions {
  /** Import into existing workspace (skip workspace creation) */
  workspaceId?: string;
}

export interface ImportWarnings {
  /** Secrets required by the agent (user needs to configure) */
  missingSecrets: string[];
  /** User variables required by the agent (user needs to configure) */
  missingVariables: string[];
  /** Provider types required (user needs to configure) */
  missingProviders: string[];
  /** Collections required by the agent (user needs to create) */
  missingCollections: ExportedCollection[];
}

export interface ImportResult {
  workspaceId: string;
  workspaceName: string;
  agentId: string;
  /** Map of refIds to new IDs */
  agentIdMap: Record<string, string>;
  warnings: ImportWarnings;
}

/** Pattern to find agent IDs in stringified nodes */
const AGENT_ID_PATTERN = /"agentId":"([^"]+)"/g;

/**
 * Remap agent IDs in nodes using the ID map
 */
function remapAgentIds(nodes: WorkflowNode[], idMap: Map<string, string>): WorkflowNode[] {
  const nodesStr = JSON.stringify(nodes);
  const remapped = nodesStr.replace(AGENT_ID_PATTERN, (match, oldId) => {
    const newId = idMap.get(oldId);
    return newId ? `"agentId":"${newId}"` : match;
  });
  return JSON.parse(remapped) as WorkflowNode[];
}

/**
 * Generate unique workspace name by appending (1), (2), etc. if name exists
 */
async function generateUniqueWorkspaceName(
  baseName: string,
  userId: string,
  workspaceRepo: IWorkspaceRepository
): Promise<string> {
  // Check if base name exists
  const { workspaces } = await workspaceRepo.findByUserId(userId, { name: `^${baseName}$` });
  if (workspaces.length === 0) return baseName;

  // Find existing names with pattern "baseName (N)"
  const pattern = `^${baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( \\(\\d+\\))?$`;
  const { workspaces: matching } = await workspaceRepo.findByUserId(userId, { name: pattern });

  // Find next available number
  let maxNum = 0;
  const numPattern = / \((\d+)\)$/;
  for (const ws of matching) {
    const match = ws.name.match(numPattern);
    if (match?.[1]) {
      maxNum = Math.max(maxNum, parseInt(match[1], 10));
    }
  }

  return `${baseName} (${maxNum + 1})`;
}

/**
 * Use the target workspace from options, or create a new one with a unique name
 */
async function resolveWorkspace(
  source: { name: string; description?: string },
  userId: string,
  deps: ImportServiceDependencies,
  options: ImportOptions
): Promise<{ workspaceId: string; workspaceName: string }> {
  if (options.workspaceId) {
    const existing = await deps.workspaceRepo.findById(options.workspaceId);
    if (!existing) {
      throw new Error(`Workspace not found: ${options.workspaceId}`);
    }
    if (existing.userId !== userId) {
      throw new Error('Access denied: Workspace belongs to another user');
    }
    return { workspaceId: existing.id, workspaceName: existing.name };
  }

  const workspaceName = await generateUniqueWorkspaceName(source.name, userId, deps.workspaceRepo);
  const workspace = await deps.workspaceRepo.create({
    userId,
    name: workspaceName,
    description: source.description,
  });
  return { workspaceId: workspace.id, workspaceName };
}

/**
 * Create agents in order and remap refIds to new IDs.
 * References to agents created later (cycles) are fixed in a second pass.
 */
async function createAgents(
  agents: ExportedAgent[],
  userId: string,
  workspaceId: string,
  deps: ImportServiceDependencies
): Promise<Map<string, string>> {
  const idMap = new Map<string, string>();
  const refIds = new Set(agents.map((a) => a.refId));
  const unresolved: ExportedAgent[] = [];

  for (const exportedAgent of agents) {
    const remappedNodes = remapAgentIds(exportedAgent.nodes, idMap);

    const created = await deps.agentRepo.create({
      userId,
      name: exportedAgent.name,
      description: exportedAgent.description,
      nodes: remappedNodes,
      editorData: exportedAgent.editorData,
      workspaceId,
    });

    const hasForwardRef = [...JSON.stringify(remappedNodes).matchAll(AGENT_ID_PATTERN)]
      .some((m) => refIds.has(m[1]!) && !idMap.has(m[1]!));
    if (hasForwardRef) {
      unresolved.push(exportedAgent);
    }

    idMap.set(exportedAgent.refId, created.id);
  }

  for (const exportedAgent of unresolved) {
    await deps.agentRepo.update(idMap.get(exportedAgent.refId)!, {
      nodes: remapAgentIds(exportedAgent.nodes, idMap),
    });
  }

  return idMap;
}

/**
 * Import an agent from an export package
 * Always creates a new workspace
 */
export async function importAgent(
  data: unknown,
  userId: string,
  deps: ImportServiceDependencies,
  options: ImportOptions = {}
): Promise<ImportResult> {
  // 1. Validate package
  if (!validateExportPackage(data)) {
    throw new Error('Invalid export package format');
  }

  const pkg = data as AgentExport;
  const warnings: ImportWarnings = {
    missingSecrets: pkg.secrets.map((s) => s.name),
    missingVariables: (pkg.variables ?? []).map((v) => v.name),
    missingProviders: [...pkg.providers],
    missingCollections: [...pkg.collections],
  };

  // 2. Get or create workspace
  const { workspaceId, workspaceName } = await resolveWorkspace(pkg.workspace, userId, deps, options);

  // 3. Collections are not auto-created - they appear in warnings.missingCollections

  // 4. Create agents (dependencies first, then main)
  const idMap = await createAgents([...pkg.dependencies, pkg.agent], userId, workspaceId, deps);

  const mainAgentId = idMap.get(pkg.agent.refId)!;

  return {
    workspaceId,
    workspaceName,
    agentId: mainAgentId,
    agentIdMap: Object.fromEntries(idMap),
    warnings,
  };
}

export interface WorkspaceImportResult {
  workspaceId: string;
  workspaceName: string;
  /** Map of refIds to new IDs */
  agentIdMap: Record<string, string>;
  warnings: ImportWarnings;
}

/**
 * Import all agents from a workspace export package
 */
export async function importWorkspace(
  data: unknown,
  userId: string,
  deps: ImportServiceDependencies,
  options: ImportOptions = {}
): Promise<WorkspaceImportResult> {
  if (!validateWorkspaceExportPackage(data)) {
    throw new Error('Invalid workspace export package format');
  }

  const pkg = data as WorkspaceExport;
  const warnings: ImportWarnings = {
    missingSecrets: pkg.secrets.map((s) => s.name),
    missingVariables: (pkg.variables ?? []).map((v) => v.name),
    missingProviders: [...pkg.providers],
    missingCollections: [...pkg.collections],
  };

  const { workspaceId, workspaceName } = await resolveWorkspace(pkg.workspace, userId, deps, options);
  const idMap = await createAgents(pkg.agents, userId, workspaceId, deps);

  return {
    workspaceId,
    workspaceName,
    agentIdMap: Object.fromEntries(idMap),
    warnings,
  };
}
