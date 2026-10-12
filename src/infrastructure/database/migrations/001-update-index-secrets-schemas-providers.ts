import mongoose from 'mongoose';
import type { Migration } from './types.js';

async function dropIndexIfExists(
  collectionName: string,
  indexName: string
): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) {
    return;
  }

  const collections = await db.listCollections({ name: collectionName }).toArray();
  if (collections.length === 0) {
    return;
  }

  const collection = mongoose.connection.collection(collectionName);
  const indexes = await collection.indexes();

  if (indexes.some((i) => i.name === indexName)) {
    console.log(`  Dropping stale index: ${collectionName}.${indexName}`);
    await collection.dropIndex(indexName);
  }
}

export const migration: Migration = {
  async up() {
    // Drop old indexes that don't include workspaceId
    // The correct indexes will be created automatically by Mongoose

    // UserSecrets: userId_1_name_1 -> userId_1_workspaceId_1_name_1
    await dropIndexIfExists('usersecrets', 'userId_1_name_1');

    // MemorySchemas (collections): userId_1_name_1 -> userId_1_workspaceId_1_name_1
    await dropIndexIfExists('memoryschemas', 'userId_1_name_1');

    // ProviderConfigs: userId_1_provider_1 -> userId_1_workspaceId_1_provider_1
    await dropIndexIfExists('providerconfigs', 'userId_1_provider_1');
  },
};
