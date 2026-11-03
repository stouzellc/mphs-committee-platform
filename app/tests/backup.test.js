// Backup and restore: encryption, full round trip, and a real restore that people can sign in to.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { encryptBackup, decryptBackup, FORMAT } from '../server/backup.js';
import { createMemoryStore } from '../server/store/index.js';
import { createApp, initialData } from '../server/app.js';
import { ensureDemoUsers } from '../server/auth.js';
import { PG_URL, resetSchema, makeStore } from './helpers.js';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PASS = 'correct horse battery staple';

test('encryption: round trip works; wrong passphrase, tampering and weak passphrases are refused', () => {
  const obj = { format: FORMAT, records: { tasks: [{ id: 'T1' }] }, users: [], audit: [] };
  const enc = encryptBackup(obj, PASS);
  assert.ok(!enc.toString('latin1').includes('T1'), 'contents are not readable');
  assert.deepEqual(decryptBackup(enc, PASS), obj);
  assert.throws(() => decryptBackup(enc, 'wrong passphrase here'), /Wrong passphrase/);
  const bad = Buffer.from(enc); bad[bad.length - 3] ^= 1;
  assert.throws(() => decryptBackup(bad, PASS), /Wrong passphrase|damaged/);
  assert.throws(() => decryptBackup(enc, ''), /encrypted/);
  assert.throws(() => encryptBackup(obj, 'short'), /at least 12/);
});

test('JSON store: export, encrypt, decrypt and import into an empty store reproduces everything', async () => {
  const a = createMemoryStore({ file: null, initial: () => initialData({ demo: true }) });
  await a.init();
  await ensureDemoUsers(a, null);
  const t = await a.get('tasks', 'T001');
  await a.update('tasks', 'T001', { owner: 'Backup Test' }, t.version, 'u-admin');
  const dump = await a.exportAll();
  const b = createMemoryStore({ file: null, initial: null });
  await b.init();
  assert.equal(await b.isEmpty(), true);
  await b.importAll(decryptBackup(encryptBackup({ format: FORMAT, ...dump }, PASS), PASS));
  const again = await b.exportAll();
  assert.deepEqual(again.records, dump.records);
  assert.deepEqual(again.users, dump.users);
  assert.deepEqual(again.audit, dump.audit);
  await assert.rejects(b.importAll(dump), /not empty/);
});

test('Postgres: backup script → restore script into a new database → identical data, and people can still sign in', { skip: !PG_URL && 'needs Postgres (npm run test:pg)', timeout: 90000 }, async () => {
  const [A, B] = ['mphs_backup_src', 'mphs_backup_dst'];
  await resetSchema(A); await resetSchema(B);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mphs-backup-'));
  const creds = path.join(dir, 'creds.txt');
  const appA = await createApp({ store: makeStore({ schema: A }), credentialsFile: creds });
  const t = await appA.store.get('tasks', 'T002');
  await appA.store.update('tasks', 'T002', { owner: 'Restored Owner' }, t.version, 'u-organizer');
  const before = await appA.store.exportAll();
  await appA.close();

  const urlFor = (schema) => { const u = new URL(PG_URL); u.searchParams.set('options', `-c search_path=${schema}`); return u.toString(); };
  const file = path.join(dir, 'b.mphsbk');
  const run = (script, schema, extra) => spawnSync(process.execPath, [script, ...extra], { cwd: appDir, encoding: 'utf8', timeout: 60000, env: { ...process.env, DATABASE_URL: urlFor(schema), BACKUP_PASSPHRASE: PASS } });

  const bk = run('scripts/backup.js', A, ['--out', file]);
  assert.equal(bk.status, 0, bk.stderr);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.ok(!fs.readFileSync(file).toString('latin1').includes('Restored Owner'), 'backup file is encrypted');

  assert.equal(run('scripts/restore.js', B, ['--in', file]).status, 2, 'requires --yes');
  const rs = run('scripts/restore.js', B, ['--in', file, '--yes']);
  assert.equal(rs.status, 0, rs.stderr + rs.stdout);
  assert.match(rs.stdout, /Counts verified/);
  assert.equal(run('scripts/restore.js', B, ['--in', file, '--yes']).status, 1, 'refuses a non-empty target');

  const appB = await createApp({ store: makeStore({ schema: B }), credentialsFile: path.join(dir, 'creds-b.txt') });
  const after = await appB.store.exportAll();
  assert.deepEqual(after.records, before.records, 'records, versions and timestamps identical');
  assert.deepEqual(after.users.map(({ createdAt, ...u }) => u), before.users.map(({ createdAt, ...u }) => u), 'members and password hashes identical');
  assert.equal(after.audit.length, before.audit.length);
  assert.equal((await appB.store.get('tasks', 'T002')).owner, 'Restored Owner');
  assert.ok(!fs.existsSync(path.join(dir, 'creds-b.txt')), 'restore did not create new demo accounts');

  const srv = http.createServer(appB.handle);
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  try {
    const pw = Object.fromEntries(fs.readFileSync(creds, 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.trim().split(/\s+/).slice(0, 2)))['admin.demo'];
    const r = await fetch(`http://127.0.0.1:${srv.address().port}/api/login`, { method: 'POST', headers: { 'X-MPHS': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin.demo', password: pw }) });
    assert.equal(r.status, 200, 'existing password works on the restored copy');
    const l = await appB.store.get('ledger', 'DTX-001');
    await assert.rejects(appB.store.update('ledger', 'DTX-001', { amount: 1 }, l.version, 't'), /locked/i, 'database rules still enforced after restore');
  } finally {
    await new Promise((r) => srv.close(r));
    await appB.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('format: encryption settings are stored and the header is authenticated; older files still open', () => {
  const obj = { format: FORMAT, records: {}, users: [], audit: [] };
  const enc = encryptBackup(obj, PASS);
  assert.equal(enc.subarray(0, 8).toString(), 'MPHSBK2\n');
  const tampered = Buffer.from(enc); tampered.writeUInt32BE(2 ** 14, 8);
  assert.throws(() => decryptBackup(tampered, PASS), /Wrong passphrase|damaged/, 'changing the stored settings is detected');
  // Version 1 layout: MAGIC | salt | iv | tag | body, fixed N=2^15, no header authentication.
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(PASS, salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([c.update(JSON.stringify(obj)), c.final()]);
  assert.deepEqual(decryptBackup(Buffer.concat([Buffer.from('MPHSBK1\n'), salt, iv, c.getAuthTag(), body]), PASS), obj);
});

test('backup script: passphrase from a file, never overwrites silently, always owner-only (JSON store)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mphs-bkjson-'));
  try {
    const s = createMemoryStore({ file: path.join(dir, 'store.json'), initial: () => initialData({ demo: true }) });
    await s.init();
    const passFile = path.join(dir, 'pass.txt');
    fs.writeFileSync(passFile, `${PASS}\n`, { mode: 0o600 });
    const out = path.join(dir, 'existing.mphsbk');
    fs.writeFileSync(out, 'old', { mode: 0o644 });
    const env = { ...process.env, DATABASE_URL: '', BACKUP_PASSPHRASE: '', BACKUP_PASSPHRASE_FILE: passFile, MPHS_DATA_DIR: dir };
    const first = spawnSync(process.execPath, ['scripts/backup.js', '--out', out], { cwd: appDir, encoding: 'utf8', env });
    assert.equal(first.status, 2, 'refuses to overwrite');
    assert.equal(fs.readFileSync(out, 'utf8'), 'old');
    const forced = spawnSync(process.execPath, ['scripts/backup.js', '--out', out, '--force'], { cwd: appDir, encoding: 'utf8', env });
    assert.equal(forced.status, 0, forced.stderr);
    assert.equal(fs.statSync(out).mode & 0o777, 0o600, 'permissions tightened on overwrite');
    assert.ok(decryptBackup(fs.readFileSync(out), PASS).records.tasks.length > 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('create-admin: refuses the JSON store unless told the server is stopped; 24-hour link; deactivated admins refused', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mphs-admincli-'));
  try {
    const env = { ...process.env, DATABASE_URL: '', MPHS_DATA_DIR: dir };
    const args = ['scripts/create-admin.js', '--email', 'cli.admin@example.invalid', '--name', 'CLI Admin'];
    assert.equal(spawnSync(process.execPath, args, { cwd: appDir, encoding: 'utf8', env }).status, 2, 'JSON store needs --force');
    const ok = spawnSync(process.execPath, [...args, '--force'], { cwd: appDir, encoding: 'utf8', env });
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /valid 24 hours/);
    const s = createMemoryStore({ file: path.join(dir, 'store.json'), initial: null });
    await s.init();
    const u = await s.findUserByEmail('cli.admin@example.invalid');
    const inv = await s.activeInvite(u.id);
    assert.ok(inv.expires - Date.now() <= 24 * 3600e3 + 5000);
    await s.updateUser(u.id, { active: false });
    const refused = spawnSync(process.execPath, [...args, '--force'], { cwd: appDir, encoding: 'utf8', env });
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /deactivated/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
