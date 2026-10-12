import type { Agent, WorkflowNode } from './Agent.js';
import type { MemorySchemaField } from './Memory.js';
import type { ProviderType } from './ProviderConfig.js';

/**
 * Export format version for compatibility checking
 */
export const AGENT_EXPORT_VERSION = '1.0';

/**
 * Exported agent data (stripped of user-specific IDs)
 */
export interface ExportedAgent {
  /** Original agent name */
  name: string;
  description: string;
  nodes: WorkflowNode[];
  /** Stable reference ID based on name (for reference mapping during import) */
  refId: string;
}

/**
 * Exported collection schema (stripped of user-specific IDs)
 * If collection not found in DB, schema is null
 */
export interface ExportedCollection {
  name: string;
  schema: {
    description: string | null;
    fields: MemorySchemaField[];
  } | null;
}

/**
 * Required secret metadata (no values exported)
 */
export interface RequiredSecret {
  name: string;
  /** Optional description to help user understand what the secret is for */
  description?: string;
}

/**
 * Complete agent export package
 */
export interface AgentExport {
  /** Export format version */
  version: string;
  /** Export timestamp */
  exportedAt: Date;

  /** Source workspace info */
  workspace: {
    name: string;
    description?: string;
  };

  /** Main agent being exported */
  agent: ExportedAgent;

  /** Dependency agents (nested agents from agent nodes) */
  dependencies: ExportedAgent[];

  /** Collections used by the agent(s) */
  collections: ExportedCollection[];

  /** Secret names required (user must provide values on import) */
  secrets: RequiredSecret[];

  /** Provider types required */
  providers: ProviderType[];
}

/**
 * Result of analyzing an agent for export
 */
export interface ExportAnalysis {
  /** Collection names used */
  collectionNames: Set<string>;
  /** Secret names referenced */
  secretNames: Set<string>;
  /** Provider types used */
  providerTypes: Set<ProviderType>;
}
