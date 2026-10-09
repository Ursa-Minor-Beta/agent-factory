/**
 * GitHub Sync Service - Push/pull agents to/from GitHub
 */

import type { Octokit } from '@octokit/rest';
import type { GitHubSync, GitHubSyncEntity, CreateGitHubSyncDTO } from '../entities/GitHubSync.js';
import { GITHUB_SYNC_STATUS, GITHUB_SYNC_ENTITY } from '../entities/GitHubSync.js';
import type { AgentExport } from '../entities/AgentExport.js';
import type { IGitHubSyncRepository } from '../interfaces/repositories/IGitHubSyncRepository.js';
import type { IProviderConfigRepository } from '../interfaces/repositories/IProviderConfigRepository.js';
import type { IAgentRepository } from '../interfaces/repositories/IAgentRepository.js';
import type { ExportedAgent } from '../entities/AgentExport.js';
import type { WorkflowNode } from '../entities/Agent.js';
import { exportAgent, validateExportPackage, type ExportServiceDependencies } from './agent-export.service.js';
import { importAgent, type ImportServiceDependencies } from './agent-import.service.js';
import * as github from '../../infrastructure/github/github.service.js';

export interface GitHubSyncDependencies {
  gitHubSyncRepo: IGitHubSyncRepository;
  providerConfigRepo: IProviderConfigRepository;
  agentRepo: IAgentRepository;
  exportDeps: ExportServiceDependencies;
  importDeps: ImportServiceDependencies;
}

/**
 * Remap agentId references in nodes to use local IDs
 */
function remapNodeReferences(
  nodes: WorkflowNode[],
  agentIdMap: Record<string, string>
): WorkflowNode[] {
  return nodes.map(node => {
    const newNode = { ...node, data: { ...node.data } };

    // Agent node - direct reference
    if (node.type === 'agent' && node.data.agentId) {
      const localId = agentIdMap[node.data.agentId as string];
      if (localId) {
        newNode.data.agentId = localId;
      }
    }

    // LLM node - check tools for agent references
    if (node.type === 'llm' && Array.isArray(node.data.tools)) {
      newNode.data.tools = (node.data.tools as Array<Record<string, unknown>>).map(tool => {
        if (tool.type === 'agent' && tool.agentId) {
          const localId = agentIdMap[tool.agentId as string];
          if (localId) {
            return { ...tool, agentId: localId };
          }
        }
        return tool;
      });
    }

    return newNode;
  });
}

export interface PushResult {
  success: boolean;
  commitSha?: string;
  message?: string;
  error?: string;
}

export interface PullResult {
  success: boolean;
  agentId?: string;
  message?: string;
  error?: string;
}

async function getGitHubClient(
  userId: string,
  providerName: string | undefined,
  publicRepo: boolean,
  deps: { providerConfigRepo: IProviderConfigRepository }
): Promise<Octokit> {
  // Public repos - unauthenticated access (read-only, 60 req/hour)
  if (publicRepo) {
    return github.createPublicGitHubClient();
  }

  let provider;

  if (!providerName) {
    // Use the default GitHub provider
    provider = await deps.providerConfigRepo.findDefault(userId, 'github');
    if (!provider) {
      throw new Error('No default GitHub provider configured');
    }
  } else {
    // Find provider by name
    const providers = await deps.providerConfigRepo.findByUserId(userId);
    provider = providers.find(p => p.provider === 'github' && p.name === providerName);
    if (!provider) {
      throw new Error(`GitHub provider "${providerName}" not found`);
    }
  }

  if (!provider.config.apiKey) {
    throw new Error(`GitHub provider "${provider.name}" has no API key configured`);
  }

  return github.createGitHubClient(provider.config.apiKey, provider.config.baseUrl);
}

function parseRepo(repository: string): { owner: string; repo: string } {
  // Handle full GitHub URLs: https://github.com/owner/repo
  if (repository.includes('github.com')) {
    const match = repository.match(/github\.com[/:]([^/]+)\/([^/\s.]+)/);
    if (match?.[1] && match[2]) {
      return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
    }
    throw new Error(`Invalid GitHub URL: ${repository}. Expected "https://github.com/owner/repo"`);
  }

  // Handle owner/repo format
  const [owner, repo] = repository.split('/');
  if (!owner || !repo) {
    throw new Error(`Invalid repository format: ${repository}. Expected "owner/repo" or GitHub URL`);
  }
  return { owner, repo };
}

/**
 * Link an entity to GitHub (create sync record)
 */
export async function linkToGitHub(
  data: CreateGitHubSyncDTO,
  deps: GitHubSyncDependencies
): Promise<GitHubSync> {
  // Check if already linked
  const existing = await deps.gitHubSyncRepo.findByEntity(
    data.userId,
    data.entityType,
    data.entityId
  );
  if (existing) {
    throw new Error('Entity is already linked to GitHub');
  }

  return deps.gitHubSyncRepo.create(data);
}

/**
 * Unlink an entity from GitHub (delete sync record)
 */
export async function unlinkFromGitHub(
  userId: string,
  entityType: GitHubSyncEntity,
  entityId: string,
  deps: GitHubSyncDependencies
): Promise<boolean> {
  const sync = await deps.gitHubSyncRepo.findByEntity(userId, entityType, entityId);
  if (!sync) {
    return false;
  }
  return deps.gitHubSyncRepo.delete(sync.id);
}

/**
 * Push agent to GitHub
 */
export async function pushAgent(
  userId: string,
  agentId: string,
  commitMessage: string,
  deps: GitHubSyncDependencies
): Promise<PushResult> {
  // Get sync config
  const sync = await deps.gitHubSyncRepo.findByEntity(userId, GITHUB_SYNC_ENTITY.AGENT, agentId);
  if (!sync) {
    return { success: false, error: 'Agent is not linked to GitHub' };
  }

  // Cannot push to public repos (read-only)
  if (sync.publicRepo) {
    return { success: false, error: 'Cannot push to public repos (read-only). Link to an authenticated provider first.' };
  }

  try {
    // Get GitHub client
    const client = await getGitHubClient(userId, sync.providerName, sync.publicRepo, deps);
    const { owner, repo } = parseRepo(sync.repository);

    // Export agent
    const exportData = await exportAgent(agentId, userId, deps.exportDeps);
    const content = JSON.stringify(exportData, null, 2);

    // Build agentIdMap: refId → localId
    const agentIdMap: Record<string, string> = {};
    agentIdMap[exportData.agent.refId] = agentId;
    for (const dep of exportData.dependencies) {
      // For push, we map refId to the local agent ID
      agentIdMap[dep.refId] = dep.refId;
    }

    // Check if file exists (for update)
    const existingFile = await github.getFile(client, {
      owner,
      repo,
      path: sync.path,
      branch: sync.branch,
    });

    // Push to GitHub
    const commit = await github.createOrUpdateFile(client, {
      owner,
      repo,
      path: sync.path,
      content,
      message: commitMessage,
      branch: sync.branch,
      sha: existingFile?.sha,
    });

    // Update sync record with agentIdMap
    await deps.gitHubSyncRepo.update(sync.id, {
      status: GITHUB_SYNC_STATUS.SYNCED,
      lastCommitSha: commit.sha,
      lastSyncedAt: new Date(),
      agentIdMap,
    });

    return { success: true, commitSha: commit.sha, message: 'Agent pushed to GitHub' };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: `[pushAgent] ${msg}` };
  }
}

/**
 * Pull agent from GitHub - updates existing agents in place
 */
export async function pullAgent(
  userId: string,
  agentId: string,
  deps: GitHubSyncDependencies
): Promise<PullResult> {
  // Get sync config
  const sync = await deps.gitHubSyncRepo.findByEntity(userId, GITHUB_SYNC_ENTITY.AGENT, agentId);
  if (!sync) {
    return { success: false, error: 'Agent is not linked to GitHub' };
  }

  try {
    // Get GitHub client
    const client = await getGitHubClient(userId, sync.providerName, sync.publicRepo, deps);
    const { owner, repo } = parseRepo(sync.repository);

    // Get file from GitHub
    const file = await github.getFile(client, {
      owner,
      repo,
      path: sync.path,
      branch: sync.branch,
    });

    if (!file) {
      return { success: false, error: 'File not found in GitHub repository' };
    }

    // Get the latest commit SHA for this file
    const commits = await github.listCommits(client, { owner, repo, path: sync.path, branch: sync.branch });
    const latestCommitSha = commits[0]?.sha ?? null;

    // Parse and validate
    const exportData = JSON.parse(file.content) as AgentExport;
    if (!validateExportPackage(exportData)) {
      return { success: false, error: 'Invalid agent export format in GitHub file' };
    }

    // Get existing agentIdMap from sync record
    const existingMap = sync.agentIdMap || {};
    const newMap: Record<string, string> = {};

    // Collect all refIds from export
    const exportRefIds = new Set<string>();
    exportRefIds.add(exportData.agent.refId);
    for (const dep of exportData.dependencies) {
      exportRefIds.add(dep.refId);
    }

    // Process dependencies first, then main agent
    const allAgents: ExportedAgent[] = [...exportData.dependencies, exportData.agent];

    for (const exportedAgent of allAgents) {
      const existingLocalId = existingMap[exportedAgent.refId];

      if (existingLocalId) {
        // Update existing agent - remap node references first
        const remappedNodes = remapNodeReferences(exportedAgent.nodes, { ...existingMap, ...newMap });
        await deps.agentRepo.update(existingLocalId, {
          name: exportedAgent.name,
          description: exportedAgent.description,
          nodes: remappedNodes,
        });
        newMap[exportedAgent.refId] = existingLocalId;
      } 
      else {
        // Create new agent
        const remappedNodes = remapNodeReferences(exportedAgent.nodes, { ...existingMap, ...newMap });
        const created = await deps.agentRepo.create({
          userId,
          name: exportedAgent.name,
          description: exportedAgent.description,
          nodes: remappedNodes,
        });
        newMap[exportedAgent.refId] = created.id;
      }
    }

    // Delete agents that were removed from GitHub (Option B)
    for (const [refId, localId] of Object.entries(existingMap)) {
      if (!exportRefIds.has(refId) && localId !== agentId) {
        // This agent was removed from the export - delete it locally
        await deps.agentRepo.delete(localId);
      }
    }

    // Update sync record with new agentIdMap
    await deps.gitHubSyncRepo.update(sync.id, {
      status: GITHUB_SYNC_STATUS.SYNCED,
      lastCommitSha: latestCommitSha,
      lastSyncedAt: new Date(),
      agentIdMap: newMap,
    });

    return { success: true, agentId, message: 'Agent pulled from GitHub' };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: `[pullAgent] ${msg}` };
  }
}

/**
 * Import agent from GitHub (without existing link)
 */
export async function importFromGitHub(
  userId: string,
  repository: string,
  path: string,
  branch: string,
  providerName: string | undefined,
  publicRepo: boolean,
  deps: GitHubSyncDependencies,
  workspaceId?: string
): Promise<PullResult> {
  try {
    const client = await getGitHubClient(userId, providerName, publicRepo, deps);
    const { owner, repo } = parseRepo(repository);

    // Get file from GitHub
    const file = await github.getFile(client, { owner, repo, path, branch });
    if (!file) {
      return { success: false, error: 'File not found in GitHub repository' };
    }

    // Get the latest commit SHA for this file
    const commits = await github.listCommits(client, { owner, repo, path, branch });
    const latestCommitSha = commits[0]?.sha ?? null;

    // Parse and validate
    const exportData = JSON.parse(file.content);
    if (!validateExportPackage(exportData)) {
      return { success: false, error: 'Invalid agent export format' };
    }

    // Import agent (creates new agents for main + all dependencies)
    const result = await importAgent(exportData, userId, deps.importDeps, { workspaceId });

    // Create sync link
    const sync = await deps.gitHubSyncRepo.create({
      userId,
      entityType: GITHUB_SYNC_ENTITY.AGENT,
      entityId: result.agentId,
      providerName: providerName || 'default',
      publicRepo,
      repository,
      branch,
      path,
    });

    // Update with sync state and agentIdMap
    await deps.gitHubSyncRepo.update(sync.id, {
      status: GITHUB_SYNC_STATUS.SYNCED,
      lastCommitSha: latestCommitSha,
      lastSyncedAt: new Date(),
      agentIdMap: result.agentIdMap,
    });

    return { success: true, agentId: result.agentId, message: 'Agent imported from GitHub' };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: `[importFromGitHub] ${msg}` };
  }
}

/**
 * Get sync status for an entity
 */
export async function getSyncStatus(
  userId: string,
  entityType: GitHubSyncEntity,
  entityId: string,
  deps: GitHubSyncDependencies
): Promise<GitHubSync | null> {
  return deps.gitHubSyncRepo.findByEntity(userId, entityType, entityId);
}

/**
 * List commit history for synced agent
 */
export async function listAgentCommits(
  userId: string,
  agentId: string,
  deps: GitHubSyncDependencies
): Promise<github.GitHubCommit[]> {
  const sync = await deps.gitHubSyncRepo.findByEntity(userId, GITHUB_SYNC_ENTITY.AGENT, agentId);
  if (!sync) {
    throw new Error('Agent is not linked to GitHub');
  }

  const client = await getGitHubClient(userId, sync.providerName, sync.publicRepo, deps);
  const { owner, repo } = parseRepo(sync.repository);

  return github.listCommits(client, { owner, repo, path: sync.path, branch: sync.branch });
}

/**
 * Mark agent as local_ahead when modified locally
 * Called after agent updates to indicate unpushed changes
 */
export async function markAgentAsLocalAhead(
  userId: string,
  agentId: string,
  deps: { gitHubSyncRepo: IGitHubSyncRepository }
): Promise<void> {
  const sync = await deps.gitHubSyncRepo.findByEntity(
    userId,
    GITHUB_SYNC_ENTITY.AGENT,
    agentId
  );
  if (sync && sync.status === GITHUB_SYNC_STATUS.SYNCED) {
    await deps.gitHubSyncRepo.update(sync.id, {
      status: GITHUB_SYNC_STATUS.LOCAL_AHEAD,
    });
  }
}

