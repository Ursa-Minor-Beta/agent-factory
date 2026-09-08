import mongoose from 'mongoose';
import { config } from '../../../config/index.js';

export async function connectDatabase(): Promise<typeof mongoose> {
  return mongoose.connect(config.mongodb.uri);
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
