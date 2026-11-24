import { MessageModel } from '../mongodb/models/MessageModel.js';
import type { Migration } from './types.js';

export const migration: Migration = {
  async up() {
    // Assistant messages saved before status existed were only written for completed runs
    const result = await MessageModel.updateMany(
      { role: 'assistant', status: { $exists: false } },
      { $set: { status: 'completed' } }
    );
    console.log(`  Backfilled status for ${result.modifiedCount} assistant messages`);
  },
};
