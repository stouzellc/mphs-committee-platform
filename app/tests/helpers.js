// Test store selection: MPHS_TEST_DATABASE_URL runs the suites against Postgres (see scripts/test-pg.js).
import pg from 'pg';
import { createMemoryStore, createPostgresStore } from '../server/store/index.js';
import { initialData } from '../server/app.js';

export const PG_URL = process.env.MPHS_TEST_DATABASE_URL || '';
export const storeKind = PG_URL ? 'postgres' : 'memory';

// Each test file gets its own Postgres schema so files can run in parallel.
export async function resetSchema(schema) {
  const c = new pg.Client({ connectionString: PG_URL });
  await c.connect();
  await c.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE; CREATE SCHEMA ${schema}`);
  await c.end();
}

export function makeStore({ file, schema, demo = true }) {
  const initial = () => initialData({ demo });
  if (!PG_URL) return createMemoryStore({ file, initial });
  const u = new URL(PG_URL);
  u.searchParams.set('options', `-c search_path=${schema}`);
  return createPostgresStore({ connectionString: u.toString(), initial });
}
