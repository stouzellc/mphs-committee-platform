// Creates or refreshes the restricted database account the app runs as. Run with the OWNER's DATABASE_URL,
// and again after every database update. The account can use everyday records but cannot change the
// audit history or the database structure.
// Usage: APP_DB_PASSWORD='…' npm run db:app-role -- [--role mphs_app] [--schema public]
import '../server/env-file.js';
import pg from 'pg';
import { connectionFromEnv } from '../server/store/ssl.js';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const role = arg('role', 'mphs_app');
const schema = arg('schema', 'public');
const password = process.env.APP_DB_PASSWORD || '';
if (!/^[a-z_][a-z0-9_]{0,62}$/.test(role) || !/^[a-z_][a-z0-9_]{0,62}$/.test(schema)) { console.error('Role and schema names: lowercase letters, digits and _.'); process.exit(2); }
if (password.length < 16) { console.error('Set APP_DB_PASSWORD (at least 16 characters).'); process.exit(2); }
if (!process.env.DATABASE_OWNER_URL && !process.env.DATABASE_URL) { console.error('Set DATABASE_OWNER_URL (or DATABASE_URL) to the database owner connection.'); process.exit(2); }

const c = new pg.Client(connectionFromEnv(process.env, { owner: true }));
await c.connect();
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
try {
  await c.query('BEGIN');
  const existing = (await c.query('SELECT rolsuper, rolcreatedb, rolcreaterole, rolbypassrls FROM pg_roles WHERE rolname = $1', [role])).rows[0];
  if (existing) {
    // Managed Postgres owners usually cannot change role attributes; only refresh the password, and verify the rest.
    if (existing.rolsuper || existing.rolcreatedb || existing.rolcreaterole || existing.rolbypassrls) {
      throw new Error(`Account "${role}" has elevated privileges (superuser, create database/role or bypass RLS). Remove them or choose another name.`);
    }
    await c.query(`ALTER ROLE ${role} WITH LOGIN PASSWORD ${lit(password)}`);
  } else {
    await c.query(`CREATE ROLE ${role} WITH LOGIN PASSWORD ${lit(password)} NOSUPERUSER NOCREATEDB NOCREATEROLE`);
  }
  await c.query(`REVOKE ALL ON ALL TABLES IN SCHEMA ${schema} FROM ${role}`);
  await c.query(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA ${schema} FROM ${role}`);
  await c.query(`REVOKE CREATE ON SCHEMA ${schema} FROM ${role}`);
  // On Postgres 14 and older, PUBLIC can create objects in the schema by default.
  await c.query(`REVOKE CREATE ON SCHEMA ${schema} FROM PUBLIC`);
  await c.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`);
  const rw = ['records', 'users', 'sessions', 'auth_states', 'invites', 'login_failures', 'photos'].map((t) => `${schema}.${t}`).join(', ');
  await c.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${rw} TO ${role}`);
  // Audit: read, and add entries without choosing their id or timestamp (no backdating or forged ordering).
  await c.query(`GRANT SELECT ON ${schema}.audit TO ${role}`);
  await c.query(`GRANT INSERT (user_id, action, collection, record_id, fields) ON ${schema}.audit TO ${role}`);
  await c.query(`GRANT SELECT, INSERT ON ${schema}.meta TO ${role}`);
  await c.query(`GRANT SELECT ON ${schema}.schema_migrations TO ${role}`);
  await c.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${schema} TO ${role}`);
  await c.query('COMMIT');
  console.log(`Account "${role}" is ready on schema "${schema}". Run the app with this account and MPHS_MIGRATIONS=skip.`);
} catch (e) {
  await c.query('ROLLBACK').catch(() => {});
  console.error(`Failed: ${e.message}`);
  process.exitCode = 1;
} finally {
  await c.end();
}
