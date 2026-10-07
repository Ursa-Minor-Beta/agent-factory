import { readdir } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { MigrationModel } from '../mongodb/models/MigrationModel.js';
import type { Migration } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface DiscoveredMigration {
  name: string;
  migration: Migration;
}

async function discoverMigrations(): Promise<DiscoveredMigration[]> {
  const files = await readdir(__dirname);

  // Match files like 001-something.js or 001-something.ts
  // Prefer .js (production) over .ts (dev with tsx)
  const migrationFiles = files
    .filter((f) => /^\d{3}-.*\.(js|ts)$/.test(f) && !f.endsWith('.d.ts'))
    .sort()
    .reduce<string[]>((acc, file) => {
      const baseName = file.replace(/\.(js|ts)$/, '');
      // Skip if we already have this migration (prefer .js over .ts)
      if (!acc.some((f) => f.replace(/\.(js|ts)$/, '') === baseName)) {
        acc.push(file);
      }
      return acc;
    }, []);

  const migrations: DiscoveredMigration[] = [];

  for (const file of migrationFiles) {
    const modulePath = join(__dirname, file);
    const module = await import(modulePath);

    // Find the exported migration (first Migration object found)
    const migration = Object.values(module).find(
      (exp): exp is Migration =>
        typeof exp === 'object' &&
        exp !== null &&
        'up' in exp &&
        typeof (exp as Migration).up === 'function'
    );

    if (migration) {
      // Use filename (without extension) as migration name
      const name = file.replace(/\.(js|ts)$/, '');
      migrations.push({ name, migration });
    }
  }

  return migrations;
}

export async function runMigrations(): Promise<void> {
  const migrations = await discoverMigrations();

  if (migrations.length === 0) {
    console.log(`No migrations found`);
    return;
  }

  const executed = await MigrationModel.find().select('name').lean();
  const executedNames = new Set(executed.map((m) => m.name));

  const pending = migrations.filter((m) => !executedNames.has(m.name));

  if (pending.length === 0) {
    return;
  }

  console.log(`Running ${pending.length} pending migration(s)...`);

  for (const { name, migration } of pending) {
    console.log(`  Running: ${name}`);
    try {
      await migration.up();
      await MigrationModel.create({ name });
      console.log(`  Completed: ${name}`);
    } catch (error) {
      console.error(`  Failed: ${name}`, error);
      throw error;
    }
  }

  console.log('Migrations completed.');
}
