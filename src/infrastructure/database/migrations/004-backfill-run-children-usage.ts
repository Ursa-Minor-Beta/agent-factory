import type mongoose from 'mongoose';
import { RunModel } from '../mongodb/models/RunModel.js';
import type { RunUsage, TokenUsage } from '../../../engine/nodes/llm/types.js';
import type { Migration } from './types.js';

interface RunWithDescendants {
  _id: mongoose.Types.ObjectId;
  descendants: { _id: mongoose.Types.ObjectId; startedAt: Date; usage?: RunUsage }[];
}

export const migration: Migration = {
  async up() {
    // Roll up all descendants (ids + usage) into each parent run saved before roll-up existed
    const parentIds = await RunModel.distinct('parentRunId', { parentRunId: { $exists: true } });
    const cursor = RunModel.aggregate<RunWithDescendants>([
      { $match: { _id: { $in: parentIds }, childRunIds: { $exists: false } } },
      {
        $graphLookup: {
          from: 'runs',
          startWith: '$_id',
          connectFromField: '_id',
          connectToField: 'parentRunId',
          as: 'descendants',
        },
      },
      { $project: { 'descendants._id': 1, 'descendants.startedAt': 1, 'descendants.usage': 1 } },
    ]).cursor();
    let updated = 0;

    for await (const doc of cursor) {
      const descendants = [...doc.descendants].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());

      const inc: Record<string, number> = {};
      for (const descendant of descendants) {
        for (const [provider, tokens] of Object.entries(descendant.usage ?? {})) {
          for (const [key, value] of Object.entries(tokens as TokenUsage)) {
            if (value) {
              inc[`usage.${provider}.${key}`] = (inc[`usage.${provider}.${key}`] ?? 0) + value;
            }
          }
        }
      }

      const update: Record<string, unknown> = {
        $set: { childRunIds: descendants.map((d) => d._id) },
      };
      if (Object.keys(inc).length > 0) {
        update.$inc = inc;
      }

      await RunModel.updateOne({ _id: doc._id }, update);
      updated++;
    }

    console.log(`  Backfilled children and usage for ${updated} runs`);
  },
};
