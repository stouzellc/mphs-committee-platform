import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { parseCsv, previewPeopleImport, detectDelimiter, normHeader } from '../server/import.js';
import { fictionalRoster, rosterWithProblems, toRosterCsv } from '../scripts/fictional-roster.js';
import { createApp, initialData } from '../server/app.js';
import { createMemoryStore } from '../server/store/index.js';

test('CSV parser handles quotes, commas, CRLF and a BOM', () => {
  assert.deepEqual(parseCsv('﻿a,b\r\n"x, y","he said ""hi"""\r\n'), [['a', 'b'], ['x, y', 'he said "hi"']]);
});

test('preview maps columns, keeps source spelling and reports unmapped columns', () => {
  const csv = 'Alumni ID,First Name,Middle Name,Last Name,Graduation Year,Locker\nFX-1,Zoë,Ann,O\'Neil-Smith,2008,12\n';
  const undecided = previewPeopleImport(csv, []);
  assert.deepEqual(undecided.undecided, ['Locker']);
  assert.equal(undecided.canApply, false, 'an unrecognised column needs a decision before apply');
  const p = previewPeopleImport(csv, [], { mapping: { Locker: 'ignore' } });
  assert.equal(p.canApply, true);
  assert.deepEqual(p.unmapped, ['Locker']);
  const r = p.rows[0].record;
  assert.equal(r.firstName, 'Zoë');
  assert.equal(r.lastName, "O'Neil-Smith");
  assert.equal(r.gradYear, 2008);
  assert.match(r.corrections, /middle name: Ann/);
  assert.match(r.provenance, /row 2/);
});

test('preview blocks apply on missing IDs, duplicate IDs in the file and missing columns', () => {
  const dup = previewPeopleImport('alumniId,firstName,lastName\nFX-1,A,B\nFX-1,C,D\n,E,F\n', []);
  assert.equal(dup.canApply, false);
  assert.deepEqual(dup.duplicatesInFile, [{ alumniId: 'FX-1', lines: [2, 3] }]);
  assert.equal(dup.summary.invalid, 3);
  const cols = previewPeopleImport('first,last\nA,B\n', []);
  assert.deepEqual(cols.missingColumns, ['alumniId']);
  assert.equal(cols.canApply, false);
});

test('preview flags records that already exist instead of planning to overwrite them', () => {
  const p = previewPeopleImport('alumniId,firstName,lastName\nFX-1,A,B\nFX-2,C,D\n', [{ alumniId: 'FX-1' }]);
  assert.equal(p.summary.existing, 1);
  assert.equal(p.summary.toAdd, 1);
  assert.equal(p.rows[0].existing, true);
});

test('preview rejects bad field values with row-level errors', () => {
  const p = previewPeopleImport('alumniId,firstName,lastName,contact permission\nFX-1,A,B,Maybe\n', []);
  assert.ok(p.rows[0].errors.contactPermission);
  assert.equal(p.canApply, false);
});

// ---- Import-day rehearsal (fictional rosters only) ----

test('Excel/Numbers variations: semicolon and tab files, header spellings, Unknown permission', () => {
  assert.equal(detectDelimiter('Alumni ID;First Name;Last Name\n'), ';');
  assert.equal(detectDelimiter('Alumni ID\tFirst Name\tLast Name\n'), '\t');
  assert.equal(detectDelimiter('"Name; with semicolon",b,c\n'), ',');
  assert.equal(normHeader(' Alumni_ID# '), 'alumni id');
  const p = previewPeopleImport('alumni_id;Given Name;Surname;Class Year;Contact Permission\nFX-1;Inès;Ford;2008;Unknown\nFX-2;Remy;Holt;2008;email ok\n', []);
  assert.equal(p.delimiter, 'semicolon');
  assert.equal(p.canApply, true, JSON.stringify(p.rows.map((r) => r.errors)));
  assert.equal(p.rows[0].record.contactPermission, 'Not recorded');
  assert.equal(p.rows[1].record.contactPermission, 'Email OK');
  assert.equal(p.rows[0].record.firstName, 'Inès');
});

test('column choices: keep as a note, ignore, refuse unknown choices and two columns on one field', () => {
  const csv = 'Alumni ID,First Name,Last Name,Homeroom,Nickname\nFX-1,Avery,Brook,Room 101,Ace\n';
  const p = previewPeopleImport(csv, [], { mapping: { Homeroom: 'note', Nickname: 'note' } });
  assert.equal(p.canApply, true);
  assert.equal(p.rows[0].record.corrections, 'Homeroom: Room 101; Nickname: Ace');
  assert.match(previewPeopleImport(csv, [], { mapping: { Homeroom: 'shoeSize' } }).error, /Unknown column choice/);
  const twice = previewPeopleImport(csv, [], { mapping: { Homeroom: 'lastName', Nickname: 'ignore' } });
  assert.deepEqual(twice.duplicateTargets, ['lastName']);
  assert.equal(twice.canApply, false);
});

test('expected row count blocks a partial file; class year and same-name checks warn without blocking', () => {
  const csv = toRosterCsv(fictionalRoster(10));
  assert.equal(previewPeopleImport(csv, [], { mapping: { Homeroom: 'ignore' }, expectedCount: 318 }).canApply, false);
  assert.match(previewPeopleImport(csv, [], { mapping: { Homeroom: 'ignore' }, expectedCount: 318 }).countProblem, /10 rows; 318 were expected/);
  assert.equal(previewPeopleImport(csv, [], { mapping: { Homeroom: 'ignore' }, expectedCount: '10' }).canApply, true);
  const w = previewPeopleImport('Alumni ID,First Name,Last Name,Graduation Year\nFX-1,Avery,Brook,2009\nFX-2,Sage,Holt,2008\n', [{ alumniId: 'FX-9', firstName: 'Sage', lastName: 'Holt' }, { alumniId: 'FX-1', firstName: 'Avery', lastName: 'Brooke' }]);
  assert.equal(w.canApply, true);
  assert.match(w.rows[0].warnings.join(), /Already exists as “Avery Brooke”/);
  assert.match(w.rows[1].warnings.join(), /Same name as Alumni ID FX-9/);
  const y = previewPeopleImport('Alumni ID,First Name,Last Name,Graduation Year\nFX-3,Avery,Brook,2009\n', []);
  assert.match(y.rows[0].warnings.join(), /Class year is 2009, not 2008/);
  assert.equal(y.canApply, true);
});

test('the practice file with mistakes reports each one', () => {
  const p = previewPeopleImport(toRosterCsv(rosterWithProblems()), [], { mapping: { Homeroom: 'ignore' } });
  assert.equal(p.canApply, false);
  assert.deepEqual(p.duplicatesInFile.map((d) => d.alumniId), ['FX-0005']);
  const at = (line) => p.rows.find((r) => r.line === line);
  assert.ok(at(11).errors.alumniId, 'missing ID');
  assert.ok(at(16).errors.lastName, 'missing last name');
  assert.ok(at(32).errors.contactPermission, 'unreadable permission');
  assert.match(at(22).warnings.join(), /2009/);
  assert.equal(p.possibleDuplicates.length, 1);
});

test('full rehearsal: 318 fictional classmates previewed, applied once, re-import adds nothing, nothing overwritten', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mphs-import-'));
  const app = await createApp({ store: createMemoryStore({ file: null, initial: () => initialData({ demo: true }) }), credentialsFile: path.join(dir, 'c.txt'), log: () => {} });
  const srv = http.createServer(app.handle).listen(0, '127.0.0.1');
  await new Promise((r) => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const creds = Object.fromEntries(fs.readFileSync(path.join(dir, 'c.txt'), 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.trim().split(/\s+/).slice(0, 2)));
    const H = { 'X-MPHS': '1', 'Content-Type': 'application/json' };
    const login = await fetch(`${base}/api/login`, { method: 'POST', headers: H, body: JSON.stringify({ username: 'admin.demo', password: creds['admin.demo'] }) });
    H.Cookie = login.headers.get('set-cookie').split(';')[0];
    const post = (step, extra) => fetch(`${base}/api/import/people/${step}`, { method: 'POST', headers: H, body: JSON.stringify({ csv: toRosterCsv(fictionalRoster()), sourceLabel: 'Fictional rehearsal', expectedCount: 318, ...extra }) }).then(async (r) => ({ status: r.status, body: await r.json() }));
    const first = await post('preview', {});
    assert.equal(first.body.canApply, false, 'Homeroom needs a decision first');
    const ok = await post('preview', { mapping: { Homeroom: 'note' } });
    assert.equal(ok.body.summary.toAdd, 318);
    assert.equal((await post('apply', { mapping: { Homeroom: 'note' } })).status, 422, 'apply needs the confirmation box');
    const applied = await post('apply', { mapping: { Homeroom: 'note' }, confirm: true });
    assert.equal(applied.body.added, 318);
    const people = await app.store.list('people');
    const fx = people.filter((p) => p.alumniId.startsWith('FX-'));
    assert.equal(fx.length, 318);
    assert.match(fx.find((p) => p.alumniId === 'FX-0004').corrections, /Source middle name: A\.; Homeroom: Room 103/);
    assert.equal(fx[0].contactPermission, 'Not recorded');
    const again = await post('apply', { mapping: { Homeroom: 'note' }, confirm: true });
    assert.equal(again.body.added, 0);
    assert.equal(again.body.skippedExisting, 318);
    assert.equal((await app.store.list('people')).length, people.length, 'no duplicates and no overwrites');
    const manual = await fetch(`${base}/api/c/people`, { method: 'POST', headers: H, body: JSON.stringify({ alumniId: 'fx-0001', firstName: 'Copy', lastName: 'Case' }) });
    assert.equal(manual.status, 409, 'adding fx-0001 by hand is refused when FX-0001 exists');
    const audit = (await app.store.history('people')).filter((a) => a.action === 'import');
    assert.ok(audit.some((a) => a.fields.includes('rows:318')), 'import is logged with its row count');
  } finally {
    await new Promise((r) => srv.close(r));
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---- Fixes from the independent review (27 Oct 2026) ----
test('review fix: a file full of identical names gives a small preview, not a huge response', () => {
  const rows = ['Alumni ID,First Name,Last Name', ...Array.from({ length: 2000 }, (_, i) => `ID-${'X'.repeat(30)}-${i},A,B`)];
  const p = previewPeopleImport(rows.join('\n'), []);
  assert.equal(p.possibleDuplicates.length, 1);
  assert.equal(p.possibleDuplicates[0].count, 2000);
  assert.equal(p.possibleDuplicates[0].entries.length, 10);
  assert.match(p.rows[0].warnings[0], /1999 other entries/);
  assert.ok(JSON.stringify(p).length < 2_000_000, `response is ${JSON.stringify(p).length} bytes`);
});

test('review fix: Alumni IDs differing only in capital letters count as the same person', () => {
  const p = previewPeopleImport('Alumni ID,First Name,Last Name\ncase-1,A,B\nFX-0002,C,D\nfx-0002,C,D\n', [{ alumniId: 'CASE-1', firstName: 'A', lastName: 'B' }]);
  assert.equal(p.rows[0].existing, true, 'case-1 matches the saved CASE-1 and is skipped');
  assert.equal(p.duplicatesInFile.length, 1);
  assert.deepEqual(p.duplicatesInFile[0].lines, [3, 4]);
  assert.equal(p.canApply, false);
});

test('review fix: columns named like built-in object properties are not auto-mapped and can still be chosen', () => {
  const csv = 'Alumni ID,First Name,Last Name,constructor,__proto__\nFX-1,A,B,x,y\n';
  const first = previewPeopleImport(csv, []);
  assert.deepEqual(first.undecided, ['constructor', '__proto__']);
  const choices = JSON.parse('{"constructor":"ignore","__proto__":"note"}');
  const p = previewPeopleImport(csv, [], { mapping: choices });
  assert.equal(p.canApply, true, JSON.stringify(p.rows[0].errors));
  assert.equal(p.rows[0].record.corrections, '__proto__: y');
  assert.equal({}.polluted, undefined);
});
