import { createMemoryStore } from './memory.js';
import { createPostgresStore } from './postgres.js';
import { connectionFromEnv } from './ssl.js';

export * from './errors.js';

// DATABASE_URL selects Postgres; otherwise the local JSON file store.
export function storeFromEnv({ env = process.env, dataFile, initial }) {
  if (env.DATABASE_URL) {
    const { connectionString, ssl } = connectionFromEnv(env);
    return createPostgresStore({ connectionString, ssl, initial, runMigrations: env.MPHS_MIGRATIONS !== 'skip' });
  }
  return createMemoryStore({ file: dataFile, initial });
}

export { createMemoryStore, createPostgresStore };
