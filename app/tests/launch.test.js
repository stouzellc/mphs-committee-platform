// Launch-settings check and first-administrator setup for the real site.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { settingsProblems, dataProblems, isProduction, demoEnabled } from '../server/launch-check.js';
import { connectionFromEnv } from '../server/store/ssl.js';
import { createApp as createAppForTest } from '../server/app.js';
import { hashPassword } from '../server/auth.js';
import http from 'node:http';
import { createMemoryStore } from '../server/store/index.js';
import { initialData } from '../server/app.js';
import { ensureDemoUsers } from '../server/auth.js';
import { PG_URL, resetSchema } from './helpers.js';
import pg from 'pg';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GOOD = { DATABASE_URL: 'postgres://x', MPHS_DEMO_FIXTURES: '0', COOKIE_SECURE: '1', PUBLIC_BASE_URL: 'https://mphs.example', DATABASE_SSL: 'require', TRUST_PROXY: '1', HOST: '0.0.0.0' };

test('settings: an unconfigured environment is not ready, with a reason for each problem', () => {
  const { errors } = settingsProblems({});
  for (const k of ['DATABASE_URL', 'TRUST_PROXY', 'COOKIE_SECURE', 'PUBLIC_BASE_URL', 'DATABASE_SSL']) assert.ok(errors.some((e) => e.includes(k)), k);
  assert.ok(settingsProblems({ ...GOOD, MPHS_DEMO_FIXTURES: '1' }).errors.some((e) => e.includes('MPHS_DEMO_FIXTURES')), 'demo explicitly on is refused');
});

test('settings: a correct production environment passes with no warnings', () => {
  assert.deepEqual(settingsProblems(GOOD), { errors: [], warnings: [] });
});

test('settings: unsafe or half-done values are caught', () => {
  assert.ok(settingsProblems({ ...GOOD, PUBLIC_BASE_URL: 'http://mphs.example' }).errors.length);
  assert.ok(settingsProblems({ ...GOOD, MPHS_PRIVATE_SITE: '0' }).errors.length);
  assert.ok(settingsProblems({ ...GOOD, AUTH_PROVIDER_ISSUER: 'https://idp' }).errors.some((e) => e.includes('half configured')));
  assert.ok(settingsProblems({ ...GOOD, TRUST_PROXY: '' }).errors.some((e) => e.includes('TRUST_PROXY')), 'proxy setting is required');
  assert.deepEqual(settingsProblems({ ...GOOD, TRUST_PROXY: '0' }).errors, [], 'explicit 0 is accepted');
  assert.ok(settingsProblems({ ...GOOD, DATABASE_URL: 'postgres://x/db?sslmode=disable' }).warnings.some((w) => w.includes('ignored')), 'URL sslmode cannot weaken require');
  assert.ok(settingsProblems({ ...GOOD, DATABASE_SSL: '', DATABASE_URL: 'postgres://x/db?sslmode=no-verify' }).errors.some((e) => e.includes('sslmode=no-verify')));
  assert.ok(settingsProblems({ ...GOOD, DATABASE_SSL: 'disable' }).warnings.length);
});

test('data: demo accounts or fictional records block launch; an empty database asks for an administrator', async () => {
  const demo = createMemoryStore({ file: null, initial: () => initialData({ demo: true }) });
  await demo.init();
  await ensureDemoUsers(demo, null);
  const d = await dataProblems(demo);
  assert.ok(d.errors.some((e) => e.includes('demo account')));
  assert.ok(d.errors.some((e) => e.includes('fictional classmate')));
  const empty = createMemoryStore({ file: null, initial: () => initialData({ demo: false }) });
  await empty.init();
  const e = await dataProblems(empty);
  assert.deepEqual(e.errors, []);
  assert.ok(e.warnings.some((w) => w.includes('create-admin')));
});

test('the server refuses to start in production with unsafe settings', () => {
  const r = spawnSync(process.execPath, ['server/server.js'], { cwd: appDir, env: { ...process.env, NODE_ENV: 'production', DATABASE_URL: '', PORT: '0' }, encoding: 'utf8', timeout: 20000 });
  assert.equal(r.status, 1);
  assert.match(r.stdout + r.stderr, /refusing to start/);
  assert.match(r.stdout, /DATABASE_URL/);
});

const freePort = () => new Promise((resolve) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); }); });

test('first launch on an empty database: create-admin link → set password → sign in; no demo data', { skip: !PG_URL && 'needs Postgres (npm run test:pg)', timeout: 60000 }, async () => {
  const schema = 'mphs_launch_suite';
  await resetSchema(schema);
  const u = new URL(PG_URL);
  u.searchParams.set('options', `-c search_path=${schema}`);
  const port = await freePort();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mphs-launch-'));
  const env = { ...process.env, ...GOOD, NODE_ENV: 'production', DATABASE_URL: u.toString(), DATABASE_SSL: 'disable', HOST: '127.0.0.1', PORT: String(port), PUBLIC_BASE_URL: `https://127.0.0.1:${port}`, MPHS_DATA_DIR: dataDir };

  const linkFile = path.join(dataDir, 'admin-link.txt');
  const admin = spawnSync(process.execPath, ['scripts/create-admin.js', '--email', 'Lead.One@example.invalid', '--name', 'Lead One (fictional)', '--link-file', linkFile], { cwd: appDir, env, encoding: 'utf8', timeout: 30000 });
  assert.equal(admin.status, 0, admin.stderr);
  assert.ok(!admin.stdout.includes('/#/invite/'), 'link kept out of console output');
  assert.equal(fs.statSync(linkFile).mode & 0o777, 0o600);
  const link = fs.readFileSync(linkFile, 'utf8').trim();
  assert.ok(link?.startsWith(`https://127.0.0.1:${port}/#/invite/`));
  const token = link.split('/#/invite/')[1].trim();

  const check = spawnSync(process.execPath, ['scripts/check-launch.js'], { cwd: appDir, env, encoding: 'utf8', timeout: 30000 });
  assert.equal(check.status, 0, check.stdout);

  const child = spawn(process.execPath, ['server/server.js'], { cwd: appDir, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (b) => { out += b; });
  child.stderr.on('data', (b) => { out += b; });
  try {
    for (let i = 0; i < 100 && !out.includes('running at'); i++) await new Promise((r) => setTimeout(r, 100));
    assert.match(out, /running at/, out);
    assert.doesNotMatch(out, /refusing/);
    const base = `http://127.0.0.1:${port}`;
    const post = (p, body, cookie) => fetch(base + p, { method: 'POST', headers: { 'X-MPHS': '1', 'Content-Type': 'application/json', 'X-Forwarded-Proto': 'https', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
    const PW = 'beacon thistle marble eighty';
    const acc = await post('/api/invite/accept', { token, password: PW, confirm: PW });
    assert.equal(acc.status, 200);
    assert.match(acc.headers.get('set-cookie'), /^__Host-mphs_session=.*; Secure/);
    const login = await post('/api/login', { username: 'lead.one@example.invalid', password: PW });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const people = await (await fetch(`${base}/api/c/people`, { headers: { Cookie: cookie } })).json();
    assert.deepEqual(people.records, [], 'no fictional classmates');
    const users = await (await fetch(`${base}/api/users`, { headers: { Cookie: cookie } })).json();
    assert.deepEqual(users.users.map((x) => x.email), ['lead.one@example.invalid'], 'only the real administrator exists');
    assert.ok(!fs.existsSync(path.join(dataDir, 'demo-credentials.postgres.local.txt')), 'no demo passwords file');
    assert.ok((await fetch(`${base}/healthz`)).headers.get('strict-transport-security'));
  } finally {
    child.kill('SIGTERM');
    await new Promise((r) => child.on('exit', r));
  }
  // After launch, a stray fictional record is reported but no longer blocks a restart.
  const pgc = new pg.Client({ connectionString: u.toString() });
  await pgc.connect();
  await pgc.query(`INSERT INTO records (collection, id, data, updated_by) VALUES ('sponsors', 'S-STRAY', '{"id":"S-STRAY","business":"x","demo":true}', 'test')`);
  await pgc.end();
  const again = spawn(process.execPath, ['server/server.js'], { cwd: appDir, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out2 = '';
  again.stdout.on('data', (b) => { out2 += b; });
  again.stderr.on('data', (b) => { out2 += b; });
  try {
    for (let i = 0; i < 100 && !out2.includes('running at') && again.exitCode === null; i++) await new Promise((r) => setTimeout(r, 100));
    assert.match(out2, /running at/, out2);
    assert.match(out2, /\(after launch\)/);
  } finally {
    again.kill('SIGTERM');
    await new Promise((r) => (again.exitCode !== null ? r() : again.on('exit', r)));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('production is assumed whenever the site looks hosted; demo data only when explicitly local', () => {
  assert.equal(isProduction({}), false);
  assert.equal(isProduction({ PUBLIC_BASE_URL: 'https://mphs.example' }), true, 'https address');
  assert.equal(isProduction({ HOST: '0.0.0.0' }), true, 'listening beyond this machine');
  assert.equal(isProduction({ HOST: '0.0.0.0', MPHS_ENV: 'development' }), false, 'explicit development');
  assert.equal(demoEnabled({}), true, 'local JSON store demo');
  assert.equal(demoEnabled({ DATABASE_URL: 'postgres://x' }), false, 'a database means no demo unless asked');
  assert.equal(demoEnabled({ DATABASE_URL: 'postgres://x', MPHS_DEMO_FIXTURES: '1' }), true);
  assert.equal(demoEnabled({ MPHS_DEMO_FIXTURES: '1', PUBLIC_BASE_URL: 'https://mphs.example' }), false, 'never on a hosted site');
});

test('database encryption: DATABASE_SSL=require strips any weaker sslmode from the URL', () => {
  const c = connectionFromEnv({ DATABASE_SSL: 'require', DATABASE_URL: 'postgres://u:p@db.example:5432/prod?sslmode=disable&application_name=mphs' });
  assert.equal(new URL(c.connectionString).searchParams.get('sslmode'), null);
  assert.equal(new URL(c.connectionString).searchParams.get('application_name'), 'mphs');
  assert.deepEqual(c.ssl, { rejectUnauthorized: true });
});

test('a server that looks hosted runs the launch check even without NODE_ENV', () => {
  const r = spawnSync(process.execPath, ['server/server.js'], { cwd: appDir, env: { ...process.env, NODE_ENV: '', MPHS_ENV: '', PUBLIC_BASE_URL: 'https://mphs.example', DATABASE_URL: '', PORT: '0' }, encoding: 'utf8', timeout: 20000 });
  assert.equal(r.status, 1);
  assert.match(r.stdout + r.stderr, /refusing to start/);
});

test('outside the local demo, nobody can mark records as demo or use DEMO- IDs (which would block a restart)', async () => {
  const store = createMemoryStore({ file: null, initial: () => initialData({ demo: false }) });
  const app = await createAppForTest({ store, demo: false });
  await store.createUser({ id: 'u-real', username: 'real.admin@example.invalid', email: 'real.admin@example.invalid', displayName: 'Real Admin', role: 'admin', ...(await hashPassword('granite orchard ripple seventy')) });
  const srv = http.createServer(app.handle);
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const h = { 'X-MPHS': '1', 'Content-Type': 'application/json' };
  try {
    const login = await fetch(`${base}/api/login`, { method: 'POST', headers: h, body: JSON.stringify({ username: 'real.admin@example.invalid', password: 'granite orchard ripple seventy' }) });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const sp = await fetch(`${base}/api/c/sponsors`, { method: 'POST', headers: { ...h, Cookie: cookie }, body: JSON.stringify({ business: 'Real Co', event: 'Reunion', status: 'Prospect', demo: true }) });
    assert.equal(sp.status, 201);
    assert.equal((await sp.json()).record.demo, false, 'demo flag ignored and set by the server');
    const p = await fetch(`${base}/api/c/people`, { method: 'POST', headers: { ...h, Cookie: cookie }, body: JSON.stringify({ alumniId: 'DEMO-9999', firstName: 'A', lastName: 'B' }) });
    assert.equal(p.status, 422);
    const imp = await fetch(`${base}/api/import/people/preview`, { method: 'POST', headers: { ...h, Cookie: cookie }, body: JSON.stringify({ csv: 'alumniId,firstName,lastName\nDEMO-1,A,B\n' }) });
    assert.equal((await imp.json()).canApply, false);
    assert.deepEqual((await dataProblems(store)).errors, []);
  } finally {
    await new Promise((r) => srv.close(r));
    await app.close();
  }
});

// ---- Free launch: Render free plan + Neon (Oct 2026) ----
test('Neon connection strings: TLS with certificate checks; sslmode and channel_binding are not passed through', () => {
  const neon = 'postgresql://owner:secretpw@ep-quiet-sun-123456.us-east-2.aws.neon.tech/mphs?sslmode=require&channel_binding=require';
  const c = connectionFromEnv({ DATABASE_URL: neon, DATABASE_SSL: 'require' });
  assert.deepEqual(c.ssl, { rejectUnauthorized: true });
  const u = new URL(c.connectionString);
  assert.equal(u.searchParams.get('sslmode'), null);
  assert.equal(u.searchParams.get('channel_binding'), null);
  assert.equal(u.hostname, 'ep-quiet-sun-123456.us-east-2.aws.neon.tech');
  assert.equal(u.password, 'secretpw', 'credentials are kept');
});

test('the free Render Blueprint passes the launch check once the two dashboard values are filled in', () => {
  const yaml = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'render.yaml'), 'utf8');
  assert.match(yaml, /plan: free/);
  assert.doesNotMatch(yaml, /^databases:/m, 'no Render database (it would be deleted after 30 days)');
  assert.doesNotMatch(yaml, /preDeployCommand/, 'free instances do not get a pre-deploy step');
  const env = {};
  for (const m of yaml.matchAll(/- key: (\w+)\n\s+value: "?([^"\n#]+?)"?\s*(?:#.*)?\n/g)) env[m[1]] = m[2];
  assert.ok(/- key: DATABASE_URL\n\s+sync: false/.test(yaml) && /- key: PUBLIC_BASE_URL\s*(#.*)?\n\s+sync: false/.test(yaml), 'secret and address are entered in the dashboard');
  const r = settingsProblems({ ...env, DATABASE_URL: 'postgresql://o:p@ep-x.us-east-2.aws.neon.tech/mphs?sslmode=require&channel_binding=require', PUBLIC_BASE_URL: 'https://mphs-class-of-2008.onrender.com' });
  assert.deepEqual(r.errors, [], JSON.stringify(r));
  assert.equal(env.DATABASE_SSL, 'require');
  assert.equal(env.TRUST_PROXY, '3');
});

test('owner scripts can read the database address from an owner-only file instead of the command line', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mphs-envfile-'));
  try {
    const f = path.join(dir, 'neon-url');
    fs.writeFileSync(f, 'postgresql://o:p@example.invalid/db\n', { mode: 0o600 });
    const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const run = (env) => spawnSync(process.execPath, ['--input-type=module', '-e', "await import('./server/env-file.js'); console.log(process.env.DATABASE_URL || '')"], { cwd: appDir, encoding: 'utf8', env: { PATH: process.env.PATH, ...env } });
    assert.equal(run({ DATABASE_URL_FILE: f }).stdout.trim(), 'postgresql://o:p@example.invalid/db', 'read from the file, newline trimmed');
    assert.equal(run({ DATABASE_URL_FILE: f, DATABASE_URL: 'postgresql://direct/x' }).stdout.trim(), 'postgresql://direct/x', 'a directly set address wins');
    assert.equal(run({}).stdout.trim(), '', 'nothing set, nothing loaded');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
