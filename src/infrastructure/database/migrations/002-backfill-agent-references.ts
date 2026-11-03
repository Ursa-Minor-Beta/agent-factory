import { AgentModel } from '../mongodb/models/AgentModel.js';
import { extractAgentReferences } from '../../../domain/services/agent-graph.service.js';
import type { Migration } from './types.js';

export const migration: Migration = {
  async up() {
    // Compute agent graph references for agents saved before references existed
    const cursor = AgentModel.find({}, { nodes: 1 }).lean().cursor();
    let updated = 0;

    for await (const doc of cursor) {
      await AgentModel.updateOne(
        { _id: doc._id },
        { $set: { references: extractAgentReferences(doc.nodes) } },
        { timestamps: false }
      );
      updated++;
    }

    console.log(`  Backfilled references for ${updated} agents`);
  },

  async down() {
    await AgentModel.updateMany({}, { $unset: { references: '' } }, { timestamps: false });
  },
};
