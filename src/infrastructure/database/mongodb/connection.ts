import mongoose from 'mongoose';
import { config } from '../../../config/index.js';
import { runMigrations } from '../migrations/runner.js';

export async function connectDatabase(): Promise<typeof mongoose> {
  const conn = await mongoose.connect(config.mongodb.uri);
  await runMigrations();
  return conn;
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
