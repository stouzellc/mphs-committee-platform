// Sign-in through an OpenID provider (local mock): invite-only matching, token validation, state/PKCE, sessions.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { startMockOidc } from '../scripts/mock-oidc.js';
import { makeStore, resetSchema, PG_URL } from './helpers.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mphs-oidc-'));
const SCHEMA = 'mphs_oidc_suite';
let mock, app, server, base;

before(async () => {
  if (PG_URL) await resetSchema(SCHEMA);
  mock = await startMockOidc();
  const srv = http.createServer((req, res) => app.handle(req, res));
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  server = srv;
  base = `http://127.0.0.1:${srv.address().port}`;
  app = await createApp({
    store: makeStore({ file: path.join(dir, 'store.json'), schema: SCHEMA }),
    credentialsFile: path.join(dir, 'creds.txt'),
    oidc: { issuer: mock.issuer, clientId: mock.clientId, clientSecret: mock.clientSecret, redirectUri: `${base}/api/auth/oidc/callback` },
    allowPassword: false,
  });
});
after(async () => {
  await new Promise((r) => server.close(r));
  await app.close();
  await mock.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
beforeEach(() => { mock.overrides = {}; });

const get = (url, headers = {}) => fetch(url.startsWith('http') ? url : base + url, { redirect: 'manual', headers });

// Runs the browser's redirect dance: app → provider → app callback. Returns the callback response.
async function signIn(email, { next = '', verified = true, headers = {} } = {}) {
  const start = await get(`/api/auth/oidc/start${next ? `?next=${encodeURIComponent(next)}` : ''}`);
  assert.equal(start.status, 302);
  const stateCookie = start.headers.getSetCookie().find((c) => c.startsWith('mphs_oidc_state=')).split(';')[0];
  const authorize = new URL(start.headers.get('location'));
  assert.equal(authorize.origin, mock.issuer);
  assert.equal(authorize.searchParams.get('code_challenge_method'), 'S256');
  authorize.searchParams.set('login_hint', email);
  if (!verified) authorize.searchParams.set('verified', 'false');
  const prov = await get(authorize.toString());
  assert.equal(prov.status, 302);
  const callback = prov.headers.get('location');
  const res = await get(callback, { Cookie: stateCookie, ...headers });
  const session = res.headers.getSetCookie().find((c) => /^(__Host-)?mphs_session=[^;]/.test(c));
  return { res, location: res.headers.get('location'), cookie: session ? session.split(';')[0] : '', callback, stateCookie };
}
const sessionUser = async (cookie) => (await (await get('/api/session', { Cookie: cookie })).json()).user;

test('auth config reports provider sign-in and disables passwords', async () => {
  const cfg = await (await get('/api/auth/config')).json();
  assert.deepEqual([cfg.oidc, cfg.password], [true, false]);
  const r = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'X-MPHS': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin.demo', password: 'x' }) });
  assert.equal(r.status, 403);
});

test('an invited organizer signs in and lands in the workspace with a server-side session', async () => {
  const { res, location, cookie } = await signIn('organizer.demo@example.invalid');
  assert.equal(res.status, 302);
  assert.equal(location, '/#/workspace');
  assert.match(res.headers.get('set-cookie'), /HttpOnly; SameSite=Lax/);
  const u = await sessionUser(cookie);
  assert.equal(u.id, 'u-organizer');
  assert.ok(u.permissions.includes('planning'));
});

test('email matching ignores case; classmates land on their own page; safe next paths are kept', async () => {
  const a = await signIn('Classmate.Demo@EXAMPLE.invalid');
  assert.equal(a.location, '/#/me');
  const b = await signIn('organizer.demo@example.invalid', { next: 'workspace/tasks' });
  assert.equal(b.location, '/#/workspace/tasks');
  const c = await signIn('organizer.demo@example.invalid', { next: '//evil.example/x' });
  assert.equal(c.location, '/#/workspace', 'unsafe next ignored');
});

test('an email that was not invited gets no session', async () => {
  const { location, cookie } = await signIn('stranger@example.invalid');
  assert.equal(location, '/#/login?error=not-invited');
  assert.equal(cookie, '');
});

test('an unverified email is refused', async () => {
  const { location, cookie } = await signIn('organizer.demo@example.invalid', { verified: false });
  assert.equal(location, '/#/login?error=unverified');
  assert.equal(cookie, '');
});

test('state is single-use and must exist', async () => {
  const first = await signIn('organizer.demo@example.invalid');
  const replay = await get(first.callback, { Cookie: first.stateCookie });
  assert.equal(replay.headers.get('location'), '/#/login?error=state');
  const forged = await get('/api/auth/oidc/callback?code=abc&state=forged');
  assert.equal(forged.headers.get('location'), '/#/login?error=state');
  const providerError = await get('/api/auth/oidc/callback?error=access_denied&state=x');
  assert.equal(providerError.headers.get('location'), '/#/login?error=provider');
});

for (const [name, overrides] of [
  ['wrong audience', { aud: 'someone-else' }],
  ['wrong issuer', { iss: 'https://evil.example' }],
  ['expired token', { exp: Math.floor(Date.now() / 1000) - 3600 }],
  ['token issued in the future', { iat: Math.floor(Date.now() / 1000) + 3600 }],
  ['bad signature', { badSignature: true }],
  ['unsigned token (alg none)', { alg: 'none' }],
  ['wrong nonce', { nonce: 'replayed' }],
]) {
  test(`rejects an ID token with ${name}`, async () => {
    mock.overrides = overrides;
    const { location, cookie } = await signIn('admin.demo@example.invalid');
    assert.equal(location, '/#/login?error=token');
    assert.equal(cookie, '');
  });
}

test('PKCE: the provider refuses a code exchanged without the matching verifier', async () => {
  const start = await get('/api/auth/oidc/start');
  const authorize = new URL(start.headers.get('location'));
  authorize.searchParams.set('login_hint', 'admin.demo@example.invalid');
  const prov = await get(authorize.toString());
  const code = new URL(prov.headers.get('location')).searchParams.get('code');
  const r = await fetch(`${mock.issuer}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${Buffer.from(`${mock.clientId}:${mock.clientSecret}`).toString('base64')}` },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: `${base}/api/auth/oidc/callback`, code_verifier: 'guess' }).toString(),
  });
  assert.equal(r.status, 400);
});

test('admin invites a member by email; that person can then sign in; deactivation ends access', async () => {
  const admin = (await signIn('admin.demo@example.invalid')).cookie;
  const post = (body) => fetch(`${base}/api/users`, { method: 'POST', headers: { Cookie: admin, 'X-MPHS': '1', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await post({ email: 'not-an-email', displayName: 'X', role: 'organizer' })).status, 422);
  const created = await post({ email: 'New.Organizer@example.invalid', displayName: 'New Organizer (fictional)', role: 'organizer' });
  assert.equal(created.status, 201);
  const u = (await created.json()).user;
  assert.equal(u.email, 'new.organizer@example.invalid');
  assert.equal(u.signIn, 'provider');
  assert.equal((await post({ email: 'new.organizer@example.invalid', displayName: 'Dup', role: 'organizer' })).status, 409);

  const member = await signIn('new.organizer@example.invalid');
  assert.equal(member.location, '/#/workspace');
  assert.equal((await sessionUser(member.cookie)).displayName, 'New Organizer (fictional)');

  const off = await fetch(`${base}/api/users/${u.id}`, { method: 'PATCH', headers: { Cookie: admin, 'X-MPHS': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ active: false }) });
  assert.equal(off.status, 200);
  assert.equal(await sessionUser(member.cookie), null, 'existing session ended');
  assert.equal((await signIn('new.organizer@example.invalid')).location, '/#/login?error=not-invited');
});

test('session cookie is Secure behind HTTPS', async () => {
  const { res } = await signIn('organizer.demo@example.invalid', { headers: { 'X-Forwarded-Proto': 'https' } });
  assert.match(res.headers.get('set-cookie'), /; Secure/);
});

test('sign-in outcomes are audited without storing the attempted email', async () => {
  await signIn('stranger2@example.invalid');
  let raw;
  if (PG_URL) {
    const r = await app.store.pool.query("SELECT (SELECT coalesce(json_agg(a), '[]') FROM audit a)::text || (SELECT coalesce(json_agg(s), '[]') FROM auth_states s)::text AS t");
    raw = r.rows[0].t;
  } else raw = fs.readFileSync(path.join(dir, 'store.json'), 'utf8');
  assert.ok(raw.includes('login-denied'), 'denial is audited');
  assert.ok(!raw.includes('stranger2@example.invalid'), 'attempted email not stored');
});

test('F9: with provider sign-in only, password links and password changes are refused server-side', async () => {
  const adminCookie = (await signIn('admin.demo@example.invalid')).cookie;
  const post = (url, body, cookie) => fetch(base + url, { method: 'POST', headers: { 'X-MPHS': '1', 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
  assert.equal((await post('/api/users/u-organizer/invite', {}, adminCookie)).status, 403);
  assert.equal((await post('/api/invite/check', { token: 'x' })).status, 403);
  assert.equal((await post('/api/invite/accept', { token: 'x', password: 'harbor lantern violet ninety' })).status, 403);
  assert.equal((await post('/api/me/password', { current: 'x', password: 'harbor lantern violet ninety' }, adminCookie)).status, 403);
});

test('login CSRF: a sign-in started in one browser cannot be completed in another', async () => {
  // Attacker starts a sign-in with their own account and stops before the callback.
  const start = await get('/api/auth/oidc/start');
  const authorize = new URL(start.headers.get('location'));
  authorize.searchParams.set('login_hint', 'organizer.demo@example.invalid');
  const callback = (await get(authorize.toString())).headers.get('location');
  // The victim's browser has no state cookie, or a different one: refused, no session.
  for (const headers of [{}, { Cookie: 'mphs_oidc_state=someone-elses-state-value-xxxxxxxx' }]) {
    const r = await get(callback, headers);
    assert.equal(r.headers.get('location'), '/#/login?error=state');
    assert.ok(!r.headers.getSetCookie().some((c) => /^mphs_session=[^;]/.test(c)));
  }
});
