// Private committee site: everything behind sign-in, personal passwords set through one-time invite links.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server/app.js';
import crypto from 'node:crypto';
import { sha256, attemptKey, ipKey } from '../server/auth.js';
import { makeStore, resetSchema, PG_URL } from './helpers.js';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mphs-private-'));
const dataFile = path.join(dir, 'store.json');
const credFile = path.join(dir, 'creds.txt');
const SCHEMA = 'mphs_private_suite';
const GOOD = 'harbor lantern violet ninety';
const logs = [];
let app, server, base, creds, admin;

async function boot() {
  const a = await createApp({ store: makeStore({ file: dataFile, schema: SCHEMA }), credentialsFile: credFile, privateSite: true, log: (m) => logs.push(m) });
  const s = http.createServer(a.handle);
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  return { a, s, url: `http://127.0.0.1:${s.address().port}` };
}

async function call(method, url, { body, cookie, b = base } = {}) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (method !== 'GET') headers['X-MPHS'] = '1';
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(b + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, text, headers: res.headers, cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
}
const login = async (username, password) => call('POST', '/api/login', { body: { username, password } });
const me = async (cookie) => (await call('GET', '/api/session', { cookie })).json.user;
const tokenOf = (r) => r.json.path.replace('/#/invite/', '');

before(async () => {
  if (PG_URL) await resetSchema(SCHEMA);
  ({ a: app, s: server, url: base } = await boot());
  creds = Object.fromEntries(fs.readFileSync(credFile, 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.trim().split(/\s+/).slice(0, 2)));
  admin = (await login('admin.demo', creds['admin.demo'])).cookie;
});
after(async () => {
  await new Promise((r) => server.close(r));
  await app.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const OPEN = ['/', '/index.html', '/js/main.js', '/js/api.js', '/js/ui.js', '/js/views/member.js', '/css/base.css', '/shared/finance.js', '/art/web/seal-96.png', '/art/web/seal-600.png', '/healthz', '/favicon.svg'];
const LOCKED = ['/art/web/mj-1-960.jpg', '/art/web/mj-5-480.jpg', '/art/embedded-brand.png', '/js/content.js', '/js/views/reunion.js', '/js/views/cruise.js', '/js/views/gallery.js', '/js/views/workspace.js', '/js/views/handbook.js', '/js/views/entrance.js', '/art/mj-1.png', '/art/mj-5.png', '/api/public/status', '/api/public/handbook-outline'];

test('signed out: only the sign-in shell loads; stories, artwork and data are refused', async () => {
  for (const u of OPEN) assert.equal((await call('GET', u)).status, 200, `open ${u}`);
  for (const u of LOCKED) assert.equal((await call('GET', u)).status, 401, `locked ${u}`);
  const s = await call('GET', '/api/session');
  assert.deepEqual([s.json.private, s.json.user], [true, null]);
});

test('the signed-out code never imports a locked file', () => {
  const allowed = new Set(OPEN.filter((p) => p.endsWith('.js')));
  for (const f of allowed) {
    const src = fs.readFileSync(path.join(appDir, f.startsWith('/shared/') ? '' : 'public', f), 'utf8');
    for (const m of src.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm)) {
      const target = m[1].startsWith('/') ? m[1] : path.posix.normalize(path.posix.join(path.posix.dirname(f), m[1]));
      assert.ok(allowed.has(target), `${f} statically imports locked ${target}`);
    }
  }
});

test('signed in: stories and artwork load, with private caching', async () => {
  const c = await call('GET', '/js/content.js', { cookie: admin });
  assert.equal(c.status, 200);
  const art = await call('GET', '/art/mj-1.png', { cookie: admin });
  assert.equal(art.status, 200);
  assert.match(art.headers.get('cache-control'), /^private/);
  assert.equal((await call('GET', '/api/public/status', { cookie: admin })).status, 200);
});

test('invite flow: admin creates a member and a one-time link; the member sets a password and signs in by email', async () => {
  const created = await call('POST', '/api/users', { cookie: admin, body: { email: 'Fictional.Member@example.invalid', displayName: 'Fictional Member', role: 'organizer' } });
  assert.equal(created.status, 201);
  const id = created.json.user.id;
  assert.equal(created.json.user.signIn, 'no password yet');
  assert.equal((await login('fictional.member@example.invalid', GOOD)).status, 401, 'no password before the invite is used');

  const organizer = (await login('organizer.demo', creds['organizer.demo'])).cookie;
  assert.equal((await call('POST', `/api/users/${id}/invite`, { cookie: organizer, body: {} })).status, 403, 'only admins create links');

  const inv = await call('POST', `/api/users/${id}/invite`, { cookie: admin, body: {} });
  assert.equal(inv.status, 201);
  assert.equal(inv.json.purpose, 'invite');
  const token = tokenOf(inv);
  assert.match(token, /^[A-Za-z0-9_-]{40,}$/);
  const users = await call('GET', '/api/users', { cookie: admin });
  assert.equal(users.json.users.find((u) => u.id === id).invite.purpose, 'invite');

  const check = await call('POST', '/api/invite/check', { body: { token } });
  assert.deepEqual([check.status, check.json.displayName, check.json.email], [200, 'Fictional Member', 'fictional.member@example.invalid']);

  for (const [pw, why] of [['short', 'too short'], ['passwordpassword', 'common'], ['mphs2008kiltie!', 'class name'], ['fictional.member-99', 'email'], ['aaaaaaaaaaaaaaaa', 'few characters']]) {
    const r = await call('POST', '/api/invite/accept', { body: { token, password: pw, confirm: pw } });
    assert.equal(r.status, 422, `rejects ${why}`);
    assert.ok(r.json.errors.password);
  }
  assert.equal((await call('POST', '/api/invite/accept', { body: { token, password: GOOD, confirm: 'different words here ok' } })).status, 422);

  const ok = await call('POST', '/api/invite/accept', { body: { token, password: GOOD, confirm: GOOD } });
  assert.equal(ok.status, 200);
  assert.equal((await me(ok.cookie)).id, id);
  assert.equal((await call('POST', '/api/invite/check', { body: { token } })).status, 404, 'link is single-use');
  assert.equal((await call('POST', '/api/invite/accept', { body: { token, password: GOOD } })).status, 404);

  const byEmail = await login('FICTIONAL.member@example.invalid', GOOD);
  assert.equal(byEmail.status, 200);
  const row = (await call('GET', '/api/users', { cookie: admin })).json.users.find((u) => u.id === id);
  assert.deepEqual([row.passwordSet, row.signIn, row.invite], [true, 'password', null]);
});

test('reset links: a new link cancels the old one; using it ends old sessions and replaces the password', async () => {
  const id = (await call('GET', '/api/users', { cookie: admin })).json.users.find((u) => u.email === 'fictional.member@example.invalid').id;
  const oldSession = (await login('fictional.member@example.invalid', GOOD)).cookie;
  const first = await call('POST', `/api/users/${id}/invite`, { cookie: admin, body: {} });
  assert.equal(first.json.purpose, 'reset');
  const second = await call('POST', `/api/users/${id}/invite`, { cookie: admin, body: {} });
  assert.equal((await call('POST', '/api/invite/check', { body: { token: tokenOf(first) } })).status, 404, 'old link cancelled');
  assert.ok(await me(oldSession), 'still signed in until the reset is used');
  const NEW = 'copper meadow sparrow twelve';
  const r = await call('POST', '/api/invite/accept', { body: { token: tokenOf(second), password: NEW, confirm: NEW } });
  assert.equal(r.status, 200);
  assert.equal(await me(oldSession), null, 'old sessions ended');
  assert.equal((await login('fictional.member@example.invalid', GOOD)).status, 401);
  assert.equal((await login('fictional.member@example.invalid', NEW)).status, 200);
});

test('expired, unknown and deactivated-member links are refused', async () => {
  assert.equal((await call('POST', '/api/invite/check', { body: { token: 'not-a-real-token' } })).status, 404);
  assert.equal((await call('POST', '/api/invite/check', { body: {} })).status, 404);
  const created = await call('POST', '/api/users', { cookie: admin, body: { email: 'expired.case@example.invalid', displayName: 'Expired Case', role: 'classmate' } });
  const id = created.json.user.id;
  await app.store.createInvite(sha256('expired-token-value'), { userId: id, purpose: 'invite', expires: Date.now() - 1000, createdBy: 'test' });
  assert.equal((await call('POST', '/api/invite/check', { body: { token: 'expired-token-value' } })).status, 404);
  const live = await call('POST', `/api/users/${id}/invite`, { cookie: admin, body: {} });
  await call('PATCH', `/api/users/${id}`, { cookie: admin, body: { active: false } });
  assert.equal((await call('POST', '/api/invite/accept', { body: { token: tokenOf(live), password: GOOD } })).status, 404);
  assert.equal((await call('POST', `/api/users/${id}/invite`, { cookie: admin, body: {} })).status, 422);
});

test('the same link used twice at once: exactly one succeeds', async () => {
  const created = await call('POST', '/api/users', { cookie: admin, body: { email: 'race.case@example.invalid', displayName: 'Race Case', role: 'organizer' } });
  const token = tokenOf(await call('POST', `/api/users/${created.json.user.id}/invite`, { cookie: admin, body: {} }));
  const results = await Promise.all([1, 2].map(() => call('POST', '/api/invite/accept', { body: { token, password: GOOD, confirm: GOOD } })));
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 404]);
});

test('changing your own password needs the current one, applies the rules, and signs out other sessions', async () => {
  const PW = 'harbor lantern violet ninety';
  const cookieA = (await login('fictional.member@example.invalid', 'copper meadow sparrow twelve')).cookie;
  const cookieB = (await login('fictional.member@example.invalid', 'copper meadow sparrow twelve')).cookie;
  assert.equal((await call('POST', '/api/me/password', { cookie: cookieA, body: { current: 'wrong', password: PW, confirm: PW } })).status, 422);
  assert.equal((await call('POST', '/api/me/password', { cookie: cookieA, body: { current: 'copper meadow sparrow twelve', password: 'short', confirm: 'short' } })).status, 422);
  const ok = await call('POST', '/api/me/password', { cookie: cookieA, body: { current: 'copper meadow sparrow twelve', password: PW, confirm: PW } });
  assert.equal(ok.status, 200);
  assert.equal(await me(cookieB), null, 'other sessions ended');
  assert.ok(await me(ok.cookie), 'fresh session for the person who changed it');
  assert.equal((await login('fictional.member@example.invalid', PW)).status, 200);
  assert.equal((await call('POST', '/api/me/password', { body: { current: 'x', password: PW } })).status, 401, 'signed-out requests refused');
});

test('sign-in attempt limits are stored, so they survive a restart', async () => {
  const key = attemptKey('127.0.0.1', 'u-treasurer');
  await app.store.clearLoginFailures(key);
  await app.store.clearLoginFailures(ipKey('127.0.0.1'));
  for (let i = 0; i < 10; i++) await login('treasurer.demo', 'wrong password');
  assert.equal((await login('treasurer.demo', creds['treasurer.demo'])).status, 429);
  await new Promise((r) => server.close(r));
  await app.close();
  ({ a: app, s: server, url: base } = await boot());
  assert.equal((await login('treasurer.demo', creds['treasurer.demo'])).status, 429, 'still locked after restart');
  await app.store.clearLoginFailures(key);
  await app.store.clearLoginFailures(ipKey('127.0.0.1'));
  assert.equal((await login('treasurer.demo', creds['treasurer.demo'])).status, 200);
  admin = (await login('admin.demo', creds['admin.demo'])).cookie;
});

test('invite tokens and passwords are never stored or logged in plain text', async () => {
  const created = await call('POST', '/api/users', { cookie: admin, body: { email: 'secret.case@example.invalid', displayName: 'Secret Case', role: 'organizer' } });
  const token = tokenOf(await call('POST', `/api/users/${created.json.user.id}/invite`, { cookie: admin, body: {} }));
  const PW = 'quartz ember willow forty';
  await call('POST', '/api/invite/accept', { body: { token, password: PW, confirm: PW } });
  let raw;
  if (PG_URL) {
    const r = await app.store.pool.query("SELECT (SELECT coalesce(json_agg(i), '[]') FROM invites i)::text || (SELECT coalesce(json_agg(a), '[]') FROM audit a)::text || (SELECT coalesce(json_agg(u), '[]') FROM users u)::text AS t");
    raw = r.rows[0].t;
  } else raw = fs.readFileSync(dataFile, 'utf8');
  assert.ok(raw.includes(sha256(token)), 'only the hash of the link is stored');
  for (const secret of [token, PW, GOOD]) {
    assert.ok(!raw.includes(secret), 'secret not in storage');
    assert.ok(!logs.join('\n').includes(secret), 'secret not in logs');
  }
});

// ---- Regression tests for the security review findings ----
const clearAll = async () => { for (const k of await allKeys()) await app.store.clearLoginFailures(k); };
async function allKeys() {
  const users = (await call('GET', '/api/users', { cookie: admin })).json?.users || [];
  const ips = ['127.0.0.1', '203.0.113.7', '198.51.100.9'];
  return ips.flatMap((ip) => [ipKey(ip), ...users.map((u) => attemptKey(ip, u.id)), ...users.map((u) => attemptKey(ip, `pw:${u.id}`))]);
}

test('F1/F2: path tricks (double slashes, dot segments, capitals) cannot reach locked code signed out', async () => {
  for (const p of ['/.//js/views/workspace.js', '/JS/views/workspace.js', '/Js/content.js', '/css/..//js/views/workspace.js', '/x/..//js/content.js', '/js//content.js', '/js/views//workspace.js', '/./js/content.js', '/ART/mj-1.png', '/art//mj-1.png', '/js/views/WORKSPACE.js', '/js\\content.js']) {
    const res = await fetch(base + p, { redirect: 'manual' });
    const body = await res.text();
    assert.ok(!/renderWorkspace|export const ART|export const SOCIAL/.test(body), `${p} leaked locked code (status ${res.status})`);
    assert.ok(res.status === 401 || /<!doctype html>/i.test(body), `${p} returned ${res.status} non-shell content`);
  }
});

test('F3: fail-closed — every file in public/ except the sign-in shell is locked when signed out', async () => {
  const open = new Set(['/index.html', '/favicon.svg', '/js/main.js', '/js/api.js', '/js/ui.js', '/js/views/member.js']);
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const files = walk(path.join(appDir, 'public')).map((f) => `/${path.relative(path.join(appDir, 'public'), f).split(path.sep).join('/')}`);
  assert.ok(files.length > 10);
  for (const f of files) {
    const status = (await fetch(base + f)).status;
    const expectOpen = open.has(f) || /^\/css\/[^/]+\.css$/.test(f) || /^\/fonts\/[^/]+\.woff2$/.test(f);
    assert.equal(status, expectOpen ? 200 : 401, `${f}`);
  }
});

test('F4: signing in to an unknown account takes as long as a real one (no timing enumeration)', async () => {
  await clearAll();
  const time = async (u) => { const t = process.hrtime.bigint(); await login(u, 'not the password at all'); return Number(process.hrtime.bigint() - t) / 1e6; };
  await time('admin.demo'); await time('nobody@example.invalid');
  let known = 0, unknown = 0;
  for (let i = 0; i < 4; i++) { known += await time('admin.demo'); unknown += await time(`nobody${i}@example.invalid`); }
  assert.ok(unknown > known * 0.5, `unknown ${unknown.toFixed(1)}ms vs known ${known.toFixed(1)}ms`);
  await clearAll();
});

test('F5: username and email share one counter; per-address cap across accounts; other addresses are not locked out', async () => {
  await clearAll();
  for (let i = 0; i < 10; i++) await login('treasurer.demo', 'wrong password');
  assert.equal((await login('treasurer.demo@example.invalid', creds['treasurer.demo'])).status, 429, 'email alias shares the lock');
  await clearAll();
  process.env.TRUST_PROXY = '1';
  try {
    const from = (ip, u, pw) => fetch(`${base}/api/login`, { method: 'POST', headers: { 'X-MPHS': '1', 'Content-Type': 'application/json', 'X-Forwarded-For': `10.9.9.9, ${ip}` }, body: JSON.stringify({ username: u, password: pw }) });
    for (let i = 0; i < 10; i++) await from('203.0.113.7', 'treasurer.demo', 'wrong');
    assert.equal((await from('203.0.113.7', 'treasurer.demo', creds['treasurer.demo'])).status, 429);
    assert.equal((await from('198.51.100.9', 'treasurer.demo', creds['treasurer.demo'])).status, 200, 'another address is not locked out');
    for (let i = 0; i < 30; i++) await from('198.51.100.9', `spray${i}@example.invalid`, 'wrong');
    assert.equal((await from('198.51.100.9', 'organizer.demo', creds['organizer.demo'])).status, 429, 'per-address cap across accounts');
  } finally {
    delete process.env.TRUST_PROXY;
    await clearAll();
  }
});

test('F6/F7: changing a member email cancels open links, retires the old address, and frees it for someone else', async () => {
  await clearAll();
  const a = await call('POST', '/api/users', { cookie: admin, body: { email: 'alpha.case@example.invalid', displayName: 'Alpha Case', role: 'organizer' } });
  const aId = a.json.user.id;
  const PW = 'granite orchard ripple seventy';
  await call('POST', '/api/invite/accept', { body: { token: tokenOf(await call('POST', `/api/users/${aId}/invite`, { cookie: admin, body: {} })), password: PW, confirm: PW } });
  const pending = tokenOf(await call('POST', `/api/users/${aId}/invite`, { cookie: admin, body: {} }));
  assert.equal((await call('PATCH', `/api/users/${aId}`, { cookie: admin, body: { email: 'alpha.new@example.invalid' } })).status, 200);
  assert.equal((await call('POST', '/api/invite/check', { body: { token: pending } })).status, 404, 'open link cancelled');
  assert.equal((await login('alpha.case@example.invalid', PW)).status, 401, 'old address no longer signs in');
  assert.equal((await login('alpha.new@example.invalid', PW)).status, 200);
  const b = await call('POST', '/api/users', { cookie: admin, body: { email: 'alpha.case@example.invalid', displayName: 'Bravo Case', role: 'organizer' } });
  assert.equal(b.status, 201, 'old address is free for another member');
  const PW2 = 'saffron glacier tunnel eleven';
  await call('POST', '/api/invite/accept', { body: { token: tokenOf(await call('POST', `/api/users/${b.json.user.id}/invite`, { cookie: admin, body: {} })), password: PW2, confirm: PW2 } });
  assert.equal((await me((await login('alpha.case@example.invalid', PW2)).cookie)).id, b.json.user.id);
  assert.equal((await call('PATCH', `/api/users/${b.json.user.id}`, { cookie: admin, body: { email: 'alpha.new@example.invalid' } })).status, 409, 'no shared emails');
  await clearAll();
});

test('F8: deactivating a member cancels their links; reactivating does not revive them', async () => {
  const c = await call('POST', '/api/users', { cookie: admin, body: { email: 'charlie.case@example.invalid', displayName: 'Charlie Case', role: 'organizer' } });
  const id = c.json.user.id;
  const token = tokenOf(await call('POST', `/api/users/${id}/invite`, { cookie: admin, body: {} }));
  await call('PATCH', `/api/users/${id}`, { cookie: admin, body: { active: false } });
  await call('PATCH', `/api/users/${id}`, { cookie: admin, body: { active: true } });
  assert.equal((await call('POST', '/api/invite/check', { body: { token } })).status, 404);
});

test('F10: password set through a link is audited with who issued it', async () => {
  const d = await call('POST', '/api/users', { cookie: admin, body: { email: 'delta.case@example.invalid', displayName: 'Delta Case', role: 'organizer' } });
  const PW = 'velvet harbor compass ninety';
  await call('POST', '/api/invite/accept', { body: { token: tokenOf(await call('POST', `/api/users/${d.json.user.id}/invite`, { cookie: admin, body: {} })), password: PW, confirm: PW } });
  const entries = await app.store.history('users', d.json.user.id);
  assert.ok(entries.some((e) => e.action === 'password-set' && e.fields.includes('issued-by:u-admin')));
});

test('F11: new hashes use stronger stored parameters; old-format hashes upgrade at the next sign-in', async () => {
  await clearAll();
  const id = (await call('GET', '/api/users', { cookie: admin })).json.users.find((u) => u.email === 'delta.case@example.invalid').id;
  let u = await app.store.getUser(id);
  assert.match(u.salt, /^scrypt\$65536\$8\$1\$[0-9a-f]{32}$/);
  const legacySalt = crypto.randomBytes(16).toString('hex');
  await app.store.updateUser(id, { salt: legacySalt, hash: crypto.scryptSync('velvet harbor compass ninety', legacySalt, 64).toString('hex') });
  assert.equal((await login('delta.case@example.invalid', 'velvet harbor compass ninety')).status, 200, 'legacy hash still verifies');
  u = await app.store.getUser(id);
  assert.match(u.salt, /^scrypt\$65536\$/, 'rehashed with current parameters');
  assert.equal((await login('delta.case@example.invalid', 'velvet harbor compass ninety')).status, 200);
});

test('F12: the JSON store does not keep empty or day-old attempt records', { skip: !!PG_URL && 'JSON store only' }, async () => {
  await app.store.recordLoginFailure('stale:test');
  const raw = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  assert.ok(Object.values(raw.loginFailures).every((list) => Array.isArray(list) && list.length > 0));
  await app.store.clearLoginFailures('stale:test');
});

test('F13: HSTS is sent when the deployment is configured for HTTPS', async () => {
  process.env.COOKIE_SECURE = '1';
  try { assert.match((await fetch(`${base}/healthz`)).headers.get('strict-transport-security') || '', /max-age=\d+/); }
  finally { delete process.env.COOKIE_SECURE; }
  assert.equal((await fetch(`${base}/healthz`)).headers.get('strict-transport-security'), null);
});

test('members stay signed in for 7 days (cookie and server-side session agree)', async () => {
  const r = await login('organizer.demo', creds['organizer.demo']);
  assert.match(r.headers.get('set-cookie'), /Max-Age=604800/);
  const hash = sha256(r.cookie.split('=')[1]);
  const s = await app.store.getSession(hash);
  const days = (s.expires - Date.now()) / 86400e3;
  assert.ok(days > 6.99 && days <= 7.001, `session lasts ${days.toFixed(3)} days`);
});

test('admin-only address check reports what the site sees, for confirming TRUST_PROXY', async () => {
  const r = await call('GET', '/api/admin/client-address', { cookie: admin });
  assert.equal(r.status, 200);
  assert.equal(r.json.detected, '127.0.0.1');
  const organizer = (await login('organizer.demo', creds['organizer.demo'])).cookie;
  assert.equal((await call('GET', '/api/admin/client-address', { cookie: organizer })).status, 403);
  assert.equal((await call('GET', '/api/admin/client-address')).status, 401);
});
