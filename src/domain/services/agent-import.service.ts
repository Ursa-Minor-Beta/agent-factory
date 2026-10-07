/**
 * Agent Import Service - Handles importing agents from export packages
 * Always creates a new workspace for isolation
 */

import type { WorkflowNode } from '../entities/Agent.js';
import type { AgentExport, ExportedAgent } from '../entities/AgentExport.js';
import { validateExportPackage } from './agent-export.service.js';
import type { IAgentRepository } from '../interfaces/repositories/IAgentRepository.js';
import type { IWorkspaceRepository } from '../interfaces/repositories/IWorkspaceRepository.js';
import type { IMemorySchemaRepository } from '../interfaces/repositories/IMemorySchemaRepository.js';

export interface ImportServiceDependencies {
  agentRepo: IAgentRepository;
  workspaceRepo: IWorkspaceRepository;
  memorySchemaRepo: IMemorySchemaRepository;
}

export interface ImportOptions {
  /** Import into existing workspace (skip workspace creation) */
  workspaceId?: string;
}

export interface ImportWarnings {
  /** Secrets required by the agent (user needs to configure) */
  missingSecrets: string[];
  /** Provider types required (user needs to configure) */
  missingProviders: string[];
  /** Collections without schema (couldn't be created) */
  collectionsWithoutSchema: string[];
}

export interface ImportResult {
  workspaceId: string;
  workspaceName: string;
  agentId: string;
  /** Map of original agent IDs to new IDs */
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
    missingProviders: [...pkg.providers],
    collectionsWithoutSchema: [],
  };

  // 2. Get or create workspace
  let workspaceId: string;
  let workspaceName: string;
  if (options.workspaceId) {
    // Use existing workspace
    const existing = await deps.workspaceRepo.findById(options.workspaceId);
    if (!existing) {
      throw new Error(`Workspace not found: ${options.workspaceId}`);
    }
    if (existing.userId !== userId) {
      throw new Error('Access denied: Workspace belongs to another user');
    }
    workspaceId = existing.id;
    workspaceName = existing.name;
  }
  else {
    // Create new workspace with unique name
    const baseName = pkg.workspace.name;
    workspaceName = await generateUniqueWorkspaceName(baseName, userId, deps.workspaceRepo);
    const workspace = await deps.workspaceRepo.create({
      userId,
      name: workspaceName,
      description: pkg.workspace.description,
    });
    workspaceId = workspace.id;
  }

  // 3. Create collections (only if schema exists)
  for (const collection of pkg.collections) {
    if (collection.schema) {
      await deps.memorySchemaRepo.create({
        userId,
        name: collection.name,
        description: collection.schema.description ?? undefined,
        fields: collection.schema.fields,
        workspaceId: workspaceId,
      });
    } else {
      warnings.collectionsWithoutSchema.push(collection.name);
    }
  }

  // 5. Create agents (dependencies first, then main)
  const idMap = new Map<string, string>();
  const allAgents: ExportedAgent[] = [...pkg.dependencies, pkg.agent];

  for (const exportedAgent of allAgents) {
    const remappedNodes = remapAgentIds(exportedAgent.nodes, idMap);

    const created = await deps.agentRepo.create({
      userId,
      name: exportedAgent.name,
      description: exportedAgent.description,
      nodes: remappedNodes,
      workspaceId: workspaceId,
    });

    idMap.set(exportedAgent.originalId, created.id);
  }

  const mainAgentId = idMap.get(pkg.agent.originalId)!;

  return {
    workspaceId,
    workspaceName,
    agentId: mainAgentId,
    agentIdMap: Object.fromEntries(idMap),
    warnings,
  };
}
