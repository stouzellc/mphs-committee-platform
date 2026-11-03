// Direct-request tests: authentication, server-side authorization, redaction, exports,
// conflict detection, persistence across restart, and static-file exposure.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { attemptKey, ipKey } from '../server/auth.js';
import { makeStore, resetSchema, PG_URL, storeKind } from './helpers.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mphs-test-'));
const dataFile = path.join(dir, 'store.json');
const credFile = path.join(dir, 'creds.txt');
const SCHEMA = 'api_suite';
const logs = [];
let server, base, creds, app;

async function boot() {
  app = await createApp({ store: makeStore({ file: dataFile, schema: SCHEMA }), credentialsFile: credFile, log: (m) => logs.push(m) });
  return new Promise((resolve) => {
    const s = http.createServer(app.handle).listen(0, '127.0.0.1', () => resolve({ s, url: `http://127.0.0.1:${s.address().port}` }));
  });
}
async function shutdown() {
  await new Promise((r) => server.close(r));
  await app.close();
}
console.log(`# api suite store: ${storeKind}`);
const resetAttempts = async () => { for (const u of ['u-admin', 'u-classmate', 'u-organizer', 'u-treasurer']) await app.store.clearLoginFailures(attemptKey('127.0.0.1', u)); await app.store.clearLoginFailures(ipKey('127.0.0.1')); };

async function call(method, url, { body, cookie, headers = {} } = {}) {
  const h = { ...headers };
  if (cookie) h.Cookie = cookie;
  if (method !== 'GET' && !('X-MPHS' in h)) h['X-MPHS'] = '1';
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const res = await fetch(base + url, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, text, headers: res.headers };
}

async function login(username) {
  const r = await call('POST', '/api/login', { body: { username, password: creds[username] } });
  assert.equal(r.status, 200, `login ${username}`);
  return r.headers.get('set-cookie').split(';')[0];
}

let S = {};
before(async () => {
  if (PG_URL) await resetSchema(SCHEMA);
  ({ s: server, url: base } = await boot());
  creds = Object.fromEntries(fs.readFileSync(credFile, 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.trim().split(/\s+/).slice(0, 2)));
  for (const u of ['classmate.demo', 'organizer.demo', 'treasurer.demo', 'admin.demo']) S[u] = await login(u);
});
after(async () => { await shutdown(); fs.rmSync(dir, { recursive: true, force: true }); });

test('demo credentials file is created outside public/ with owner-only permissions', () => {
  const mode = fs.statSync(credFile).mode & 0o777;
  assert.equal(mode, 0o600);
  assert.ok(!credFile.includes(`${path.sep}public${path.sep}`));
});

test('anonymous users get public status only', async () => {
  const pub = await call('GET', '/api/public/status');
  assert.equal(pub.status, 200);
  assert.ok(!/DEMO-|alumniId|example\.invalid/.test(pub.text));
  for (const url of ['/api/c/decisions', '/api/c/people', '/api/c/ledger', '/api/summary', '/api/handbook', '/api/export/people.csv', '/api/me/participation', '/api/users']) {
    assert.equal((await call('GET', url)).status, 401, url);
  }
});

test('static serving exposes only public files and approved artwork', async () => {
  assert.equal((await call('GET', '/art/mj-1.png')).status, 200);
  assert.equal((await call('GET', '/art/secret.png')).status, 404);
  assert.equal((await call('GET', '/art/..%2Fsources%2FMPHS-Reunion-Cruise-Tracker-v1.xlsx')).status, 404);
  for (const url of ['/server/seed.js', '/data/store.json', '/../sources/MPHS-audit-and-design-direction.md', '/tests/api.test.js', '/package.json']) {
    const r = await call('GET', url);
    assert.ok(!/demoRecords|example\.invalid|"sessions"|sha256/.test(r.text), `${url} leaked server content`);
  }
  const f = await call('GET', '/shared/finance.js');
  assert.equal(f.status, 200);
  assert.equal((await call('GET', '/shared/../server/auth.js')).text.includes('scryptSync'), false);
});

test('mutations without the same-origin header are blocked', async () => {
  const r = await call('POST', '/api/login', { body: { username: 'admin.demo', password: creds['admin.demo'] }, headers: { 'X-MPHS': '0' } });
  assert.equal(r.status, 403);
  const r2 = await call('PATCH', '/api/c/tasks/T001', { body: { status: 'Done', version: 1 }, cookie: S['organizer.demo'], headers: { 'X-MPHS': '1', Origin: 'https://evil.example' } });
  assert.equal(r2.status, 403);
});

test('wrong password is rejected and session cookie is HttpOnly + SameSite=Lax', async () => {
  await resetAttempts();
  const bad = await call('POST', '/api/login', { body: { username: 'admin.demo', password: 'nope' } });
  assert.equal(bad.status, 401);
  const ok = await call('POST', '/api/login', { body: { username: 'admin.demo', password: creds['admin.demo'] } });
  const c = ok.headers.get('set-cookie');
  assert.match(c, /HttpOnly/);
  assert.match(c, /SameSite=Lax/);
});

test('classmate cannot read planning, CRM or ledger records by direct request', async () => {
  const c = S['classmate.demo'];
  for (const url of ['/api/c/decisions', '/api/c/people', '/api/c/participation', '/api/c/ledger', '/api/summary', '/api/balances', '/api/handbook', '/api/export/people.csv', '/api/export/decisions.csv', '/api/users']) {
    assert.equal((await call('GET', url, { cookie: c })).status, 403, url);
  }
  assert.equal((await call('PATCH', '/api/c/tasks/T001', { cookie: c, body: { status: 'Done', version: 1 } })).status, 403);
});

test('classmate sees and edits only their own participation', async () => {
  const c = S['classmate.demo'];
  const mine = await call('GET', '/api/me/participation', { cookie: c });
  assert.equal(mine.status, 200);
  assert.equal(mine.json.records.length, 1);
  assert.ok(!('agreedTotal' in mine.json.records[0]) && !('alumniId' in mine.json.records[0]));
  assert.equal((await call('PATCH', '/api/me/participation/PT1', { cookie: c, body: { status: 'Declined', version: 1 } })).status, 404, 'other person record');
  const own = mine.json.records[0];
  assert.equal((await call('PATCH', `/api/me/participation/${own.id}`, { cookie: c, body: { status: 'Booked', version: own.version } })).status, 422);
  assert.equal((await call('PATCH', `/api/me/participation/${own.id}`, { cookie: c, body: { agreedTotal: 0, version: own.version } })).status, 422);
  const ok = await call('PATCH', `/api/me/participation/${own.id}`, { cookie: c, body: { status: 'RSVP yes', guests: 1, version: own.version } });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.record.status, 'RSVP yes');
  const cr = await call('POST', '/api/me/participation', { cookie: c, body: { event: 'Cruise', status: 'Interested' } });
  assert.equal(cr.status, 201);
  assert.equal((await call('POST', '/api/me/participation', { cookie: c, body: { event: 'Cruise', status: 'Interested' } })).status, 422, 'no duplicate');
});

test('memory submissions need permission, stay unpublished and can be withdrawn', async () => {
  const c = S['classmate.demo'];
  assert.equal((await call('POST', '/api/me/memories', { cookie: c, body: { title: 'x', story: 'y', permission: false } })).status, 422);
  const r = await call('POST', '/api/me/memories', { cookie: c, body: { title: 'Fictional test memory', story: 'Fictional.', permission: true } });
  assert.equal(r.status, 201);
  assert.equal(r.json.record.status, 'Submitted');
  const w = await call('POST', `/api/me/memories/${r.json.record.id}/withdraw`, { cookie: c, body: {} });
  assert.equal(w.json.record.status, 'Withdrawn');
  const o = S['organizer.demo'];
  const re = await call('PATCH', `/api/c/memories/${r.json.record.id}`, { cookie: o, body: { status: 'Approved', version: w.json.record.version } });
  assert.equal(re.status, 422, 'withdrawn cannot be re-approved');
  assert.equal((await call('GET', '/api/public/status')).text.includes('Fictional test memory'), false);
});

test('organizer without contact/finance permissions gets redacted CRM fields, including in exports', async () => {
  const o = S['organizer.demo'];
  const people = await call('GET', '/api/c/people', { cookie: o });
  assert.equal(people.status, 200);
  assert.ok(people.json.records.every((p) => p.email === '[restricted]' && p.phone === '[restricted]'));
  const parts = await call('GET', '/api/c/participation', { cookie: o });
  assert.ok(parts.json.records.every((p) => p.agreedTotal === '[restricted]'));
  const csv = await call('GET', '/api/export/people.csv', { cookie: o });
  assert.equal(csv.status, 200);
  assert.ok(!csv.text.includes('example.invalid'));
  assert.equal((await call('GET', '/api/c/ledger', { cookie: o })).status, 403);
  assert.equal((await call('GET', '/api/export/ledger.csv', { cookie: o })).status, 403);
  const p1 = parts.json.records.find((p) => p.id === 'PT1');
  assert.equal((await call('PATCH', '/api/c/participation/PT1', { cookie: o, body: { agreedTotal: 1, version: p1.version } })).status, 422);
  assert.equal((await call('PATCH', '/api/c/people/DEMO-0001', { cookie: o, body: { email: 'x@example.invalid', version: 1 } })).status, 403);
  const sum = await call('GET', '/api/summary', { cookie: o });
  assert.equal(sum.json.Reunion.ledger, undefined);
});

test('administrator sees contact fields', async () => {
  const people = await call('GET', '/api/c/people', { cookie: S['admin.demo'] });
  assert.ok(people.json.records.some((p) => p.email.endsWith('@example.invalid')));
});

test('treasurer ledger: duplicates rejected, no deletes, balances follow the rules', async () => {
  const t = S['treasurer.demo'];
  const dupId = await call('POST', '/api/c/ledger', { cookie: t, body: { txnId: 'DTX-001', providerRef: 'NEW-1', event: 'Reunion', type: 'Payment', kind: 'Ticket', amount: 10, status: 'Confirmed', receivedBy: 'Committee' } });
  assert.equal(dupId.status, 409);
  const dupRef = await call('POST', '/api/c/ledger', { cookie: t, body: { txnId: 'NEW-TX', providerRef: 'DPR-001', event: 'Reunion', type: 'Payment', kind: 'Ticket', amount: 10, status: 'Confirmed', receivedBy: 'Committee' } });
  assert.equal(dupRef.status, 409);
  assert.equal((await call('POST', '/api/c/ledger', { cookie: t, body: { txnId: 'NEG', event: 'Reunion', type: 'Payment', amount: -5, status: 'Confirmed', receivedBy: 'Committee' } })).status, 422);
  assert.equal((await call('DELETE', '/api/c/ledger/DTX-001?version=1', { cookie: t })).status, 405);
  const bal = await call('GET', '/api/balances', { cookie: t });
  const row = (id, ev) => bal.json.rows.find((r) => r.alumniId === id && r.event === ev);
  assert.equal(row('DEMO-0001', 'Reunion').standing, 'Paid in full');
  assert.equal(row('DEMO-0003', 'Reunion').net, 0, 'pending payment not counted');
  assert.equal(row('DEMO-0005', 'Cruise').net, 0, 'refund subtracts');
  assert.match(row('DEMO-0005', 'Cruise').depositRecord, /historical/);
  assert.equal(row('DEMO-0003', 'Cruise').balance, 'Pending', 'no agreed total');
  const sum = await call('GET', '/api/summary', { cookie: t });
  assert.equal(sum.json.Cruise.ledger.netReceipts, 250);
  assert.equal(sum.json.cabins.bookedCabins, 1, 'two travelers in DEMO-CAB-A count once; DEMO-CAB-B unconfirmed');
  assert.equal(sum.json.Reunion.sponsors.committed, 500, 'prospect and declined excluded');
});

test('decision approval needs approver, date and evidence', async () => {
  const o = S['organizer.demo'];
  const d = await call('GET', '/api/c/decisions/D005', { cookie: o });
  const r = await call('PATCH', '/api/c/decisions/D005', { cookie: o, body: { status: 'Approved', version: d.json.record.version } });
  assert.equal(r.status, 422);
  assert.ok(r.json.errors.approver && r.json.errors.date && r.json.errors.evidence);
});

test('validation rejects unknown fields and bad values', async () => {
  const o = S['organizer.demo'];
  const r = await call('PATCH', '/api/c/budgetLines/RB01', { cookie: o, body: { estimate: '12abc', hacker: 1, version: 1 } });
  assert.equal(r.status, 422);
  assert.ok(r.json.errors.estimate && r.json.errors.hacker);
});

test('two sessions: conflicting edit is detected, not silently overwritten; saved value persists after restart', async () => {
  const a = S['organizer.demo'], b = S['admin.demo'];
  const t0 = (await call('GET', '/api/c/tasks/T003', { cookie: a })).json.record;
  const first = await call('PATCH', '/api/c/tasks/T003', { cookie: a, body: { owner: 'Demo Organizer', version: t0.version } });
  assert.equal(first.status, 200);
  const seenByB = (await call('GET', '/api/c/tasks/T003', { cookie: b })).json.record;
  assert.equal(seenByB.owner, 'Demo Organizer', 'second session sees saved change');
  const stale = await call('PATCH', '/api/c/tasks/T003', { cookie: b, body: { owner: 'Someone Else', version: t0.version } });
  assert.equal(stale.status, 409);
  assert.equal(stale.json.current.owner, 'Demo Organizer');
  const hist = await call('GET', '/api/history/tasks/T003', { cookie: a });
  assert.ok(hist.json.history.some((h) => h.fields.includes('owner') && h.userId === 'u-organizer'));

  await shutdown();
  ({ s: server, url: base } = await boot());
  const after = (await call('GET', '/api/c/tasks/T003', { cookie: a })).json.record;
  assert.equal(after.owner, 'Demo Organizer', 'persists across restart; session survives restart');
});

test('CSV export neutralises formula text entered by users', async () => {
  const o = S['organizer.demo'];
  const r = await call('POST', '/api/c/tasks', { cookie: o, body: { title: '=HYPERLINK("http://x","y")', event: 'Shared', priority: 'Low', status: 'Not started' } });
  assert.equal(r.status, 201);
  const csv = await call('GET', '/api/export/tasks.csv', { cookie: o });
  assert.ok(csv.text.includes(`"'=HYPERLINK(""http://x"",""y"")"`));
});

test('access changes are admin-only and deactivation ends sessions', async () => {
  assert.equal((await call('PATCH', '/api/users/u-treasurer', { cookie: S['organizer.demo'], body: { active: false } })).status, 403);
  assert.equal((await call('PATCH', '/api/users/u-admin', { cookie: S['admin.demo'], body: { role: 'organizer' } })).status, 422, 'cannot demote self');
  const r = await call('PATCH', '/api/users/u-treasurer', { cookie: S['admin.demo'], body: { active: false } });
  assert.equal(r.status, 200);
  assert.equal((await call('GET', '/api/c/ledger', { cookie: S['treasurer.demo'] })).status, 401);
  await call('PATCH', '/api/users/u-treasurer', { cookie: S['admin.demo'], body: { active: true } });
  assert.equal((await call('GET', '/api/c/ledger', { cookie: S['treasurer.demo'] })).status, 401, 'old session stays ended after reactivation');
  S['treasurer.demo'] = await login('treasurer.demo');
});

test('server logs contain no record values or contact data', () => {
  const joined = logs.join('\n');
  assert.ok(!/example\.invalid|555-01|Demo Classmate/.test(joined));
});

test('import: contact permission required; preview first; apply needs confirmation and never overwrites', async () => {
  const csv = 'Alumni ID,First Name,Last Name,Graduation Year\nFX-100,Test,Fictional,2008\nDEMO-0001,Changed,Name,2008\n';
  assert.equal((await call('POST', '/api/import/people/preview', { cookie: S['organizer.demo'], body: { csv } })).status, 403);
  const a = S['admin.demo'];
  const p = await call('POST', '/api/import/people/preview', { cookie: a, body: { csv } });
  assert.equal(p.status, 200);
  assert.equal(p.json.summary.toAdd, 1);
  assert.equal(p.json.summary.existing, 1);
  assert.equal((await call('GET', '/api/c/people/FX-100', { cookie: a })).status, 404, 'preview does not write');
  assert.equal((await call('POST', '/api/import/people/apply', { cookie: a, body: { csv } })).status, 422, 'needs confirm');
  const ap = await call('POST', '/api/import/people/apply', { cookie: a, body: { csv, confirm: true, sourceLabel: 'Fictional test file' } });
  assert.equal(ap.status, 200);
  assert.equal(ap.json.added, 1);
  const kept = (await call('GET', '/api/c/people/DEMO-0001', { cookie: a })).json.record;
  assert.equal(kept.firstName, 'Avery', 'existing record not overwritten');
  const added = (await call('GET', '/api/c/people/FX-100', { cookie: a })).json.record;
  assert.match(added.provenance, /Fictional test file, row 2/);
  const bad = await call('POST', '/api/import/people/apply', { cookie: a, body: { csv: 'alumniId,firstName,lastName\nX1,A,B\nX1,C,D\n', confirm: true } });
  assert.equal(bad.status, 422);
  const hist = await call('GET', '/api/history/people', { cookie: a });
  assert.ok(hist.json.history.some((h) => h.action === 'import'));
});

test('ledger: confirmed rows are locked; void needs a reason; void is final', async () => {
  const t = S['treasurer.demo'];
  const rec = (await call('GET', '/api/c/ledger/DTX-004', { cookie: t })).json.record;
  const edit = await call('PATCH', '/api/c/ledger/DTX-004', { cookie: t, body: { amount: 1, version: rec.version } });
  assert.equal(edit.status, 422);
  assert.ok(edit.json.errors.amount);
  assert.equal((await call('PATCH', '/api/c/ledger/DTX-004', { cookie: t, body: { status: 'Pending', version: rec.version } })).status, 422);
  assert.equal((await call('PATCH', '/api/c/ledger/DTX-004', { cookie: t, body: { status: 'Void', version: rec.version } })).status, 422, 'reason required');
  const v = await call('PATCH', '/api/c/ledger/DTX-004', { cookie: t, body: { status: 'Void', note: 'Fictional correction test', version: rec.version } });
  assert.equal(v.status, 200);
  assert.equal((await call('PATCH', '/api/c/ledger/DTX-004', { cookie: t, body: { status: 'Confirmed', version: v.json.record.version } })).status, 422);
  const hist = await call('GET', '/api/history/ledger/DTX-004', { cookie: t });
  assert.ok(hist.json.history.some((h) => h.action === 'ledger-status' && h.fields.includes('amount 250')));
});

test('ledger: duplicate check ignores case and spaces; key fields are required', async () => {
  const t = S['treasurer.demo'];
  const base = { event: 'Cruise', type: 'Payment', kind: 'Deposit', amount: 250, status: 'Confirmed', receivedBy: 'Provider' };
  assert.equal((await call('POST', '/api/c/ledger', { cookie: t, body: { ...base, txnId: ' dtx-003 ' } })).status, 409);
  assert.equal((await call('POST', '/api/c/ledger', { cookie: t, body: { ...base, txnId: 'NEW-9', providerRef: 'dpr-003' } })).status, 409);
  const missing = await call('POST', '/api/c/ledger', { cookie: t, body: { txnId: 'Q-NOAMT' } });
  assert.equal(missing.status, 422);
  for (const f of ['event', 'type', 'kind', 'status', 'receivedBy', 'amount']) assert.ok(missing.json.errors[f], f);
  const ok = await call('POST', '/api/c/ledger', { cookie: t, body: { ...base, txnId: 'new-ok-1', alumniId: 'DEMO-0006' } });
  assert.equal(ok.json.record.txnId, 'NEW-OK-1');
});

test('funding gap basis: summaries report committee-held money separately from provider-held', async () => {
  const s = await call('GET', '/api/summary', { cookie: S['treasurer.demo'] });
  const l = s.json.Cruise.ledger;
  assert.equal(typeof l.receivedByCommittee, 'number');
  assert.equal(l.receivedByCommittee + l.receivedByProvider, l.netReceipts);
});

test('person balance counts only ticket, deposit and balance payments', async () => {
  const t = S['treasurer.demo'];
  await call('POST', '/api/c/ledger', { cookie: t, body: { txnId: 'MERCH-1', alumniId: 'DEMO-0001', event: 'Reunion', type: 'Payment', kind: 'Merch', amount: 40, status: 'Confirmed', receivedBy: 'Committee' } });
  const bal = await call('GET', '/api/balances', { cookie: t });
  const r = bal.json.rows.find((x) => x.alumniId === 'DEMO-0001' && x.event === 'Reunion');
  assert.equal(r.net, 150);
  assert.equal(r.standing, 'Paid in full');
});

test('hard deletes are limited; decisions and CRM records cannot be deleted', async () => {
  const o = S['organizer.demo'];
  assert.equal((await call('DELETE', '/api/c/decisions/D001?version=1', { cookie: o })).status, 405);
  assert.equal((await call('DELETE', '/api/c/participation/PT8?version=1', { cookie: o })).status, 405);
  assert.equal((await call('DELETE', '/api/c/budgetLines/RB02?version=1', { cookie: o })).status, 405);
});

test('non-object JSON bodies are rejected with 400, not 500', async () => {
  const o = S['organizer.demo'];
  for (const [m, u] of [['POST', '/api/c/tasks'], ['PATCH', '/api/c/tasks/T001'], ['POST', '/api/login']]) {
    const res = await fetch(base + u, { method: m, headers: { 'X-MPHS': '1', 'Content-Type': 'application/json', Cookie: o }, body: 'null' });
    assert.equal(res.status, 400, `${m} ${u}`);
  }
  assert.equal((await call('POST', '/api/me/participation', { cookie: S['classmate.demo'], body: [] })).status, 400);
});

test('Cabin IDs stay unique on edit', async () => {
  const o = S['organizer.demo'];
  const c2 = (await call('GET', '/api/c/cabins/CAB2', { cookie: o })).json.record;
  const r = await call('PATCH', '/api/c/cabins/CAB2', { cookie: o, body: { cabinId: 'demo-cab-a', version: c2.version } });
  assert.equal(r.status, 422);
});

test('public artwork is served without author or prompt metadata', async () => {
  const res = await fetch(base + '/art/mj-1.png');
  const buf = Buffer.from(await res.arrayBuffer());
  assert.equal(res.status, 200);
  assert.ok(!/s\.touze|mj\.run|Author/.test(buf.toString('latin1')));
});

test('closeout checklist comes from the tracker with cell references', async () => {
  const r = await call('GET', '/api/c/closeout', { cookie: S['organizer.demo'] });
  assert.equal(r.json.records.length, 7);
  assert.equal(r.json.records[0].title, 'Photo gallery with permission');
  assert.equal(r.json.records[6].source, 'Tracker v1 Closeout!B13');
});

test('login lockout is per address and username, so one user cannot lock out others', async () => {
  await resetAttempts();
  for (let i = 0; i < 10; i++) await call('POST', '/api/login', { body: { username: 'classmate.demo', password: 'wrong' } });
  assert.equal((await call('POST', '/api/login', { body: { username: 'classmate.demo', password: creds['classmate.demo'] } })).status, 429);
  assert.equal((await call('POST', '/api/login', { body: { username: 'admin.demo', password: creds['admin.demo'] } })).status, 200);
  await resetAttempts();
});

test('ledger: the note on a confirmed transaction is locked except when voiding', async () => {
  const t = S['treasurer.demo'];
  const r = (await call('GET', '/api/c/ledger/DTX-003', { cookie: t })).json.record;
  const edit = await call('PATCH', '/api/c/ledger/DTX-003', { cookie: t, body: { note: 'rewritten history', version: r.version } });
  assert.equal(edit.status, 422);
  assert.ok(edit.json.errors.note);
});
