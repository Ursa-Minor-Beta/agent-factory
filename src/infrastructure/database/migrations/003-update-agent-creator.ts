import { AgentModel } from '../mongodb/models/AgentModel.js';
import { AGENT_CREATOR } from '../../../engine/agents/agent-creator.js';
import type { Migration } from './types.js';

export const migration: Migration = {
  async up() {
    // Sync the Agent Creator system agent with the current prompt and tools (branch node, memory tools, workspaces)
    const result = await AgentModel.updateOne(
      { systemName: 'agent-creator' },
      { $set: { name: AGENT_CREATOR.name, description: AGENT_CREATOR.description, nodes: AGENT_CREATOR.nodes } }
    );

    console.log(`  Updated ${result.modifiedCount} Agent Creator system agent(s)`);
  },
};
