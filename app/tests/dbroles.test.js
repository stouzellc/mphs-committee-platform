// Restricted app database account, separate migrations, and undo steps. Postgres only.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createPostgresStore } from '../server/store/postgres.js';
import { createApp, initialData } from '../server/app.js';
import { PG_URL, resetSchema } from './helpers.js';

const skip = !PG_URL && 'needs Postgres (npm run test:pg)';
const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA = 'mphs_roles_suite';
const ROLE = `mphs_app_t${crypto.randomBytes(3).toString('hex')}`;
const ROLE_PW = crypto.randomBytes(16).toString('hex');
const withPath = (url, schema) => { const u = new URL(url); u.searchParams.set('options', `-c search_path=${schema}`); return u.toString(); };
const ownerUrl = () => withPath(PG_URL, SCHEMA);
const appUrl = () => { const u = new URL(PG_URL); u.username = ROLE; u.password = ROLE_PW; return withPath(u.toString(), SCHEMA); };
const run = (script, args = [], env = {}) => spawnSync(process.execPath, [script, ...args], { cwd: appDir, encoding: 'utf8', timeout: 60000, env: { ...process.env, ...env } });
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mphs-roles-'));

after(async () => {
  fs.rmSync(dir, { recursive: true, force: true });
  if (skip) return;
  const c = new pg.Client({ connectionString: PG_URL });
  await c.connect();
  await c.query(`DROP OWNED BY ${ROLE}`).catch(() => {});
  await c.query(`DROP ROLE IF EXISTS ${ROLE}`).catch(() => {});
  await c.end();
});

test('owner applies database updates; the app runs under a restricted account that cannot rewrite history', { skip, timeout: 90000 }, async () => {
  await resetSchema(SCHEMA);
  const mig = run('scripts/migrate.js', [], { DATABASE_URL: ownerUrl() });
  assert.equal(mig.status, 0, mig.stderr);
  assert.match(run('scripts/migrate.js', ['--status'], { DATABASE_URL: ownerUrl() }).stdout, /"applied":\[1,2,3,4\]/);
  // Seed once as the owner (as the first deploy would).
  const seedApp = await createApp({ store: createPostgresStore({ connectionString: ownerUrl(), initial: () => initialData({ demo: true }) }), credentialsFile: path.join(dir, 'creds.txt') });
  await seedApp.close();

  assert.equal(run('scripts/db-app-role.js', ['--role', ROLE, '--schema', SCHEMA], { DATABASE_URL: PG_URL, APP_DB_PASSWORD: 'short' }).status, 2, 'weak password refused');
  const role = run('scripts/db-app-role.js', ['--role', ROLE, '--schema', SCHEMA], { DATABASE_URL: PG_URL, APP_DB_PASSWORD: ROLE_PW });
  assert.equal(role.status, 0, role.stderr);

  const app = await createApp({ store: createPostgresStore({ connectionString: appUrl(), initial: () => initialData({ demo: true }), runMigrations: false }), credentialsFile: path.join(dir, 'creds.txt') });
  try {
    const t = await app.store.get('tasks', 'T003');
    const u = await app.store.update('tasks', 'T003', { owner: 'Role Test' }, t.version, 'u-admin');
    assert.equal(u.owner, 'Role Test', 'everyday edits work');
    assert.ok((await app.store.history('tasks', 'T003')).some((h) => h.action === 'update'), 'audit entries can be added');
    await app.store.putPhoto('MEM-ROLE', { mime: 'image/png', data: Buffer.from('png-bytes'), sha256: 'x', createdBy: 'u-admin' });
    assert.equal((await app.store.getPhoto('MEM-ROLE')).data.toString(), 'png-bytes', 'photos can be saved and read');
    await app.store.deletePhoto('MEM-ROLE');
    assert.equal(await app.store.getPhoto('MEM-ROLE'), null, 'photos can be deleted');
    const c = new pg.Client({ connectionString: appUrl() });
    await c.connect();
    try {
      for (const sql of ["UPDATE audit SET action = 'x'", 'DELETE FROM audit', 'TRUNCATE audit', 'CREATE TABLE sneaky (x int)', 'DROP TABLE records', 'ALTER TABLE users ADD COLUMN x int', "UPDATE meta SET value = 'x'", 'DELETE FROM schema_migrations']) {
        await assert.rejects(c.query(sql), (e) => e.code === '42501', `refused: ${sql}`);
      }
    } finally { await c.end(); }
  } finally { await app.close(); }
});

test('undo steps: rolling back updates 2-4 is refused by the app until reapplied, and records survive the round trip', { skip, timeout: 90000 }, async () => {
  assert.equal(run('scripts/migrate.js', ['--down-to', '1'], { DATABASE_URL: ownerUrl() }).status, 2, 'requires --yes');
  const down = run('scripts/migrate.js', ['--down-to', '1', '--yes'], { DATABASE_URL: ownerUrl() });
  assert.equal(down.status, 0, down.stderr);
  assert.match(down.stdout, /Undid database updates: 4, 3, 2/);
  const appStore = createPostgresStore({ connectionString: appUrl(), initial: null, runMigrations: false });
  await assert.rejects(appStore.init(), /Database updates 2, 3, 4 are not applied/);
  await appStore.close();
  assert.equal(run('scripts/migrate.js', [], { DATABASE_URL: ownerUrl() }).status, 0);
  assert.equal(run('scripts/db-app-role.js', ['--role', ROLE, '--schema', SCHEMA], { DATABASE_URL: PG_URL, APP_DB_PASSWORD: ROLE_PW }).status, 0, 'refresh grants after the update');
  const s = createPostgresStore({ connectionString: appUrl(), initial: null, runMigrations: false });
  await s.init();
  try {
    assert.equal((await s.get('tasks', 'T003')).owner, 'Role Test', 'records kept through undo and redo');
    await s.createInvite('h-test', { userId: 'u-admin', purpose: 'reset', expires: Date.now() + 60e3, createdBy: 'test' });
    assert.ok(await s.getInvite('h-test'), 'invite table back and usable');
  } finally { await s.close(); }
});

test('undo to 0 removes every MPHS table, and updates can be applied again from scratch', { skip, timeout: 60000 }, async () => {
  const schema = 'mphs_roles_zero';
  await resetSchema(schema);
  const url = withPath(PG_URL, schema);
  assert.equal(run('scripts/migrate.js', [], { DATABASE_URL: url }).status, 0);
  assert.equal(run('scripts/migrate.js', ['--down-to', '0', '--yes'], { DATABASE_URL: url }).status, 0);
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  const left = (await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name <> 'schema_migrations'", [schema])).rows;
  await c.end();
  assert.deepEqual(left, []);
  assert.equal(run('scripts/migrate.js', [], { DATABASE_URL: url }).status, 0);
});

test('managed-Postgres style owner (not a superuser): app-role setup can be re-run; audit entries cannot be backdated', { skip, timeout: 90000 }, async () => {
  const owner = `mphs_own_t${crypto.randomBytes(3).toString('hex')}`;
  const ownerPw = crypto.randomBytes(12).toString('hex');
  const role = `${ROLE}b`;
  const schema = 'mphs_roles_managed';
  const su = new pg.Client({ connectionString: PG_URL });
  await su.connect();
  try {
    await su.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await su.query(`CREATE ROLE ${owner} LOGIN CREATEROLE PASSWORD '${ownerPw}'`);
    await su.query(`CREATE SCHEMA ${schema} AUTHORIZATION ${owner}`);
    const ou = new URL(PG_URL); ou.username = owner; ou.password = ownerPw;
    const ownerConn = withPath(ou.toString(), schema);
    assert.equal(run('scripts/migrate.js', [], { DATABASE_URL: ownerConn }).status, 0, 'migrate as non-superuser owner');
    for (let i = 0; i < 2; i++) {
      const r = run('scripts/db-app-role.js', ['--role', role, '--schema', schema], { DATABASE_URL: ownerConn, APP_DB_PASSWORD: ROLE_PW });
      assert.equal(r.status, 0, `run ${i + 1}: ${r.stderr}`);
    }
    const au = new URL(PG_URL); au.username = role; au.password = ROLE_PW;
    const c = new pg.Client({ connectionString: withPath(au.toString(), schema) });
    await c.connect();
    try {
      await c.query("INSERT INTO audit (user_id, action, collection, record_id, fields) VALUES ('u', 'note', 'tasks', 'T1', '{}')");
      await assert.rejects(c.query("INSERT INTO audit (at, user_id, action, collection, record_id) VALUES ('2000-01-01', 'u', 'forged', 'tasks', 'T1')"), (e) => e.code === '42501', 'cannot choose the timestamp');
      await assert.rejects(c.query("INSERT INTO audit (id, user_id, action, collection, record_id) VALUES (1, 'u', 'forged', 'tasks', 'T1')"), (e) => e.code === '42501', 'cannot choose the id');
      await assert.rejects(c.query('CREATE TABLE sneaky (x int)'), (e) => e.code === '42501');
    } finally { await c.end(); }
  } finally {
    await su.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {});
    for (const r of [role, owner]) { await su.query(`DROP OWNED BY ${r}`).catch(() => {}); await su.query(`DROP ROLE IF EXISTS ${r}`).catch(() => {}); }
    await su.end();
  }
});
