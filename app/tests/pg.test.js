// Database-level guarantees, tested directly against Postgres (bypassing the app's own checks).
// Skipped unless MPHS_TEST_DATABASE_URL is set (npm run test:pg).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PG_URL, makeStore, resetSchema } from './helpers.js';
import { ConflictError, ConstraintError } from '../server/store/index.js';

const SCHEMA = 'mphs_db_suite';
const skip = !PG_URL && 'set MPHS_TEST_DATABASE_URL (npm run test:pg)';
let store;

before(async () => {
  if (skip) return;
  await resetSchema(SCHEMA);
  store = makeStore({ schema: SCHEMA });
  await store.init();
});
after(async () => { if (store) await store.close(); });

const sql = (text, params) => store.pool.query(text, params);
const ledgerRow = (o) => ({ id: o.txnId, event: 'Cruise', type: 'Payment', kind: 'Deposit', amount: 100, status: 'Confirmed', receivedBy: 'Provider', providerRef: '', ...o });

test('migrations are recorded and re-running init is a no-op', { skip }, async () => {
  const v = await sql('SELECT version FROM schema_migrations ORDER BY version');
  assert.deepEqual(v.rows.map((r) => r.version), [1, 2, 3, 4]);
  const before = (await sql('SELECT count(*)::int AS n FROM records')).rows[0].n;
  await store.init();
  assert.equal((await sql('SELECT count(*)::int AS n FROM records')).rows[0].n, before, 'seed runs once');
  assert.equal(await store.mode(), 'local-demo');
});

test('seed keeps tracker source references and demo flags', { skip }, async () => {
  const d = await store.get('decisions', 'D001');
  assert.equal(d.source, 'Tracker v1 Decisions!A7');
  assert.equal(d.version, 1);
  const p = await store.get('people', 'DEMO-0001');
  assert.equal(p.demo, true);
  assert.equal((await store.list('closeout')).length, 7);
});

test('duplicate transaction IDs and provider refs are rejected by the database, ignoring case and spaces', { skip }, async () => {
  await assert.rejects(store.insert('ledger', ledgerRow({ id: 'X-1', txnId: ' dtx-001 ' }), 't'), (e) => e instanceof ConstraintError && e.field === 'txnId');
  await assert.rejects(store.insert('ledger', ledgerRow({ txnId: 'NEW-1', providerRef: 'dpr-002' }), 't'), (e) => e instanceof ConstraintError && e.field === 'providerRef');
  await store.insert('ledger', ledgerRow({ txnId: 'NEW-2' }), 't');
  await store.insert('ledger', ledgerRow({ txnId: 'NEW-3' }), 't'); // empty provider refs don't collide
});

test('negative amounts are rejected by a check constraint', { skip }, async () => {
  await assert.rejects(store.insert('ledger', ledgerRow({ txnId: 'NEG-1', amount: -1 }), 't'), (e) => e instanceof ConstraintError && e.field === 'amount');
});

test('confirmed ledger rows are locked and ledger rows cannot be deleted, even with raw SQL', { skip }, async () => {
  await assert.rejects(sql(`UPDATE records SET data = jsonb_set(data, '{amount}', '1') WHERE collection = 'ledger' AND id = 'DTX-001'`), /locked/);
  await assert.rejects(sql(`UPDATE records SET data = jsonb_set(data, '{status}', '"Pending"') WHERE collection = 'ledger' AND id = 'DTX-001'`), /only be voided/);
  await assert.rejects(sql(`DELETE FROM records WHERE collection = 'ledger' AND id = 'DTX-001'`), /cannot be deleted/);
  const r = await store.get('ledger', 'DTX-001');
  await assert.rejects(store.update('ledger', 'DTX-001', { amount: 5 }, r.version, 't'), (e) => e instanceof ConstraintError && e.field === 'amount');
  const v = await store.update('ledger', 'DTX-001', { status: 'Void', note: 'Fictional void test' }, r.version, 't');
  assert.equal(v.status, 'Void');
  await assert.rejects(store.update('ledger', 'DTX-001', { status: 'Confirmed' }, v.version, 't'), (e) => e instanceof ConstraintError && e.field === 'status');
});

test('cabin IDs and participation per person per event are unique', { skip }, async () => {
  await assert.rejects(store.insert('cabins', { id: 'CAB9', cabinId: 'demo-cab-a ', capacity: 2, providerConfirmed: false }, 't'), (e) => e instanceof ConstraintError && e.field === 'cabinId');
  await assert.rejects(store.insert('participation', { id: 'PT99', alumniId: 'DEMO-0001', event: 'Reunion', status: 'Interested' }, 't'), (e) => e instanceof ConstraintError);
});

test('the audit log is append-only', { skip }, async () => {
  assert.ok((await store.history('ledger', 'DTX-001')).some((h) => h.action === 'update'));
  await assert.rejects(sql('UPDATE audit SET action = $1', ['tampered']), /append-only/);
  await assert.rejects(sql('DELETE FROM audit'), /append-only/);
  await assert.rejects(sql('TRUNCATE audit'), /append-only/);
});

test('concurrent saves of the same version: exactly one wins, the other gets a conflict', { skip }, async () => {
  const t = await store.get('tasks', 'T002');
  const results = await Promise.allSettled([
    store.update('tasks', 'T002', { owner: 'Session A' }, t.version, 'a'),
    store.update('tasks', 'T002', { owner: 'Session B' }, t.version, 'b'),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const lost = results.find((r) => r.status === 'rejected');
  assert.ok(lost.reason instanceof ConflictError);
  const final = await store.get('tasks', 'T002');
  assert.equal(final.version, t.version + 1);
  assert.equal(final.owner, results.find((r) => r.status === 'fulfilled').value.owner);
});

test('user emails are unique ignoring case; sessions cascade when a user is removed', { skip }, async () => {
  await store.createUser({ id: 'u-x', username: 'x@example.invalid', email: 'X@example.invalid', displayName: 'X', role: 'organizer' });
  await assert.rejects(store.createUser({ id: 'u-y', username: 'y', email: 'x@EXAMPLE.invalid', displayName: 'Y', role: 'organizer' }), ConflictError);
  assert.equal((await store.findUserByEmail(' x@example.INVALID ')).id, 'u-x');
  await store.createSession('h1', 'u-x', Date.now() + 60e3);
  await sql("DELETE FROM users WHERE id = 'u-x'");
  assert.equal(await store.getSession('h1'), undefined);
});

test('sign-in state is single-use and expires', { skip }, async () => {
  await store.putAuthState('s1', { nonce: 'n' }, Date.now() + 60e3);
  assert.deepEqual(await store.takeAuthState('s1'), { nonce: 'n' });
  assert.equal(await store.takeAuthState('s1'), null);
  await store.putAuthState('s2', { nonce: 'n' }, Date.now() - 1);
  assert.equal(await store.takeAuthState('s2'), null);
});

test('the database also locks the note on confirmed ledger rows, but allows it when voiding', { skip }, async () => {
  await store.insert('ledger', { id: 'NOTE-1', txnId: 'NOTE-1', providerRef: '', event: 'Cruise', type: 'Payment', kind: 'Deposit', amount: 10, status: 'Confirmed', receivedBy: 'Provider', note: 'original' }, 't');
  await assert.rejects(sql(`UPDATE records SET data = jsonb_set(data, '{note}', '"rewritten"') WHERE collection = 'ledger' AND id = 'NOTE-1'`), /note is locked/);
  await sql(`UPDATE records SET data = data || '{"status":"Void","note":"voided: entered twice"}' WHERE collection = 'ledger' AND id = 'NOTE-1'`);
  assert.equal((await store.get('ledger', 'NOTE-1')).status, 'Void');
});
