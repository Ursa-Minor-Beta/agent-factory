import mongoose from 'mongoose';
import { config } from '../../../config/index.js';
import { runMigrations } from '../migrations/runner.js';

export async function connectDatabase(): Promise<typeof mongoose> {
  const maxAttempts = 30;
  const retryDelay = 3000; // 3 seconds
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`MongoDB connection attempt ${attempt}/${maxAttempts}...`);
      const conn = await mongoose.connect(config.mongodb.uri);
      console.log('MongoDB connected successfully');
      await runMigrations();
      return conn;
    } catch (error) {
      lastError = error as Error;
      console.error(`MongoDB connection attempt ${attempt} failed:`, lastError.message);

      if (attempt < maxAttempts) {
        console.log(`Retrying in ${retryDelay / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  throw new Error(`Failed to connect to MongoDB after ${maxAttempts} attempts: ${lastError?.message}`);
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
