// Review-first CSV import for classmate records: parse, map, validate, report duplicates, then apply.
// Apply only adds new Alumni IDs. Existing records are never overwritten; corrections go in the corrections log.
// Every column must be accounted for before apply: imported into a field, kept as a note, or deliberately ignored.
import { validate } from './policy.js';

export const CLASS_YEAR = 2008;

// Excel and Numbers export commas, semicolons (some regional settings) or tabs; the header line decides.
export function detectDelimiter(text) {
  const first = String(text).replace(/^﻿/, '').split(/\r?\n/, 1)[0] || '';
  let q = false;
  const counts = { ',': 0, ';': 0, '\t': 0 };
  for (const c of first) { if (c === '"') q = !q; else if (!q && c in counts) counts[c]++; }
  const [best, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return n ? best : ',';
}

export function parseCsv(text, delimiter = detectDelimiter(text)) {
  const rows = [];
  let row = [], cell = '', q = false;
  const s = String(text).replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === delimiter) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

// Header names are compared after lowercasing and turning _ - # . into spaces.
export const normHeader = (h) => String(h).toLowerCase().replace(/[_\-#.:]+/g, ' ').replace(/\s+/g, ' ').trim();
const SYNONYMS = {
  alumniId: ['alumni id', 'alumniid', 'id', 'alumni no', 'alumni number', 'stable id'],
  firstName: ['first name', 'firstname', 'first', 'given name'],
  middleName: ['middle name', 'middlename', 'middle', 'middle initial'],
  lastName: ['last name', 'lastname', 'last', 'surname', 'family name'],
  gradYear: ['graduation year', 'grad year', 'gradyear', 'class', 'class year'],
  email: ['email', 'email address', 'e mail'],
  phone: ['phone', 'phone number', 'mobile', 'cell'],
  contactPermission: ['contact permission', 'permission', 'outreach permission'],
  optOut: ['opt out', 'optout', 'opted out'],
  provenance: ['provenance', 'source'],
};
const MAP = Object.fromEntries(Object.entries(SYNONYMS).flatMap(([f, names]) => names.map((n) => [n, f])));
// Targets a person can choose for a column in the preview.
export const TARGETS = [...Object.keys(SYNONYMS), 'note', 'ignore'];

const PERMISSIONS = ['Not recorded', 'Email OK', 'Phone OK', 'Do not contact'];
const UNKNOWN = ['unknown', 'not recorded', 'none', 'n/a', 'na', '-', '?'];
const YES = ['yes', 'y', 'true', '1', 'x'], NO = ['no', 'n', 'false', '0'];
// Alumni IDs are compared without regard to case or surrounding spaces (FX-0002 and fx-0002 are the same person).
const idKey = (v) => String(v || '').trim().toUpperCase();
const nameKey = (r) => `${String(r.firstName || '').trim().toLowerCase()}|${String(r.lastName || '').trim().toLowerCase()}`;

export const MAX_ROWS = 2000;

export function previewPeopleImport(text, existing, { sourceLabel = 'CSV import', mapping: chosen = {}, expectedCount = null } = {}) {
  const delimiter = detectDelimiter(text);
  const rows = parseCsv(text, delimiter);
  if (!rows.length) return { error: 'The file is empty.' };
  if (rows.length - 1 > MAX_ROWS) return { error: `Too many rows (max ${MAX_ROWS}).` };
  const header = rows[0].map((h) => h.trim());
  const bad = Object.entries(chosen || {}).filter(([, t]) => !TARGETS.includes(t)).map(([h]) => h);
  if (bad.length) return { error: `Unknown column choice for: ${bad.join(', ')}` };
  const columns = header.map((h) => {
    const key = normHeader(h);
    const auto = Object.hasOwn(MAP, key) ? MAP[key] : null;
    const pick = Object.hasOwn(chosen || {}, h) ? chosen[h] : null;
    return { header: h, auto, target: pick || auto };
  });
  const mapping = columns.map((c) => (['note', 'ignore'].includes(c.target) ? null : c.target));
  const undecided = columns.filter((c) => !c.target).map((c) => c.header);
  const unmapped = header.filter((h, i) => !mapping[i]);
  const missingColumns = ['alumniId', 'firstName', 'lastName'].filter((f) => !mapping.includes(f));
  const dupTargets = [...new Set(mapping.filter((f, i) => f && mapping.indexOf(f) !== i))];
  const existingById = new Map(existing.map((p) => [idKey(p.alumniId), p]));
  const seen = new Map();
  const out = rows.slice(1).map((cells, i) => {
    const raw = {};
    const notes = [];
    columns.forEach((c, j) => {
      const v = (cells[j] ?? '').trim();
      if (c.target === 'note') { if (v) notes.push(`${c.header}: ${v}`); }
      else if (c.target && c.target !== 'ignore') raw[c.target] = v;
    });
    const errors = {};
    const warnings = [];
    if (raw.gradYear !== undefined && raw.gradYear !== '') { const n = Number(raw.gradYear); if (Number.isInteger(n)) raw.gradYear = n; }
    else delete raw.gradYear;
    if (raw.optOut !== undefined) {
      const v = raw.optOut.toLowerCase();
      if (YES.includes(v)) raw.optOut = true;
      else if (NO.includes(v) || v === '') raw.optOut = false;
      else errors.optOut = 'Use Yes or No';
    }
    if (raw.contactPermission !== undefined) {
      const v = raw.contactPermission.toLowerCase();
      if (v === '') delete raw.contactPermission;
      else if (UNKNOWN.includes(v)) raw.contactPermission = 'Not recorded';
      else raw.contactPermission = PERMISSIONS.find((p) => p.toLowerCase() === v) || raw.contactPermission;
    }
    for (const f of ['email', 'phone', 'provenance']) if (raw[f] === '') delete raw[f];
    const middle = raw.middleName; delete raw.middleName;
    const record = { ...raw, provenance: raw.provenance || `${sourceLabel}, row ${i + 2}`, corrections: [middle ? `Source middle name: ${middle}` : '', ...notes].filter(Boolean).join('; ') };
    const v = validate('people', record);
    if (errors.optOut) delete v.errors.optOut;
    Object.assign(errors, v.errors);
    if (!raw.alumniId) errors.alumniId = 'Alumni ID is required; stable IDs come from the source';
    if (typeof v.value.gradYear === 'number' && v.value.gradYear !== CLASS_YEAR) warnings.push(`Class year is ${v.value.gradYear}, not ${CLASS_YEAR}`);
    const id = raw.alumniId;
    const prior = id ? existingById.get(idKey(id)) : null;
    if (prior && nameKey(prior) !== nameKey(record)) warnings.push(`Already exists as “${prior.firstName} ${prior.lastName}”; the existing record is kept`);
    if (id) { const k = idKey(id); if (!seen.has(k)) seen.set(k, { alumniId: id, lines: [] }); seen.get(k).lines.push(i + 2); }
    return { line: i + 2, record: v.value, middleName: middle || '', errors, warnings, existing: !!prior };
  });
  const duplicatesInFile = [...seen.values()].filter((d) => d.lines.length > 1);
  const dupSet = new Set(duplicatesInFile.map((d) => idKey(d.alumniId)));
  for (const r of out) if (dupSet.has(idKey(r.record.alumniId))) r.errors.alumniId = 'Duplicate Alumni ID in this file (IDs are compared without regard to capital letters)';

  // Same first and last name under different Alumni IDs: possibly one person twice, possibly two people. Review, not an error.
  // Each group is listed once (first few IDs plus a count), so a file of identical names cannot make a huge response.
  const byName = new Map();
  const add = (key, entry) => { if (!byName.has(key)) byName.set(key, []); byName.get(key).push(entry); };
  for (const p of existing) if (p.firstName && p.lastName) add(nameKey(p), { alumniId: p.alumniId, line: null, name: `${p.firstName} ${p.lastName}` });
  for (const r of out) if (r.record.firstName && r.record.lastName && !r.existing) add(nameKey(r.record), { alumniId: r.record.alumniId, line: r.line, name: `${r.record.firstName} ${r.record.lastName}`, row: r });
  const possibleDuplicates = [];
  for (const list of byName.values()) {
    if (new Set(list.map((x) => idKey(x.alumniId))).size < 2 || !list.some((x) => x.line)) continue;
    possibleDuplicates.push({ name: list.find((x) => x.line).name, count: list.length, entries: list.slice(0, 10).map(({ alumniId, line }) => ({ alumniId, line })) });
    const others = list.length - 1;
    const sample = (e) => list.filter((x) => x !== e).slice(0, 3).map((x) => x.alumniId).join(', ');
    for (const e of list) if (e.row) e.row.warnings.push(`Same name as ${others === 1 ? `Alumni ID ${sample(e)}` : `${others} other entries (e.g. ${sample(e)})`}`);
  }
  if (possibleDuplicates.length > 50) possibleDuplicates.splice(50);

  const invalid = out.filter((r) => Object.keys(r.errors).length).length;
  const expected = expectedCount === null || expectedCount === '' || expectedCount === undefined ? null : Number(expectedCount);
  const countProblem = expected !== null && (!Number.isInteger(expected) || expected !== out.length) ? `The file has ${out.length} rows; ${expectedCount} were expected` : '';
  return {
    delimiter: { ',': 'comma', ';': 'semicolon', '\t': 'tab' }[delimiter],
    header, columns, mapping, unmapped, undecided, missingColumns, duplicateTargets: dupTargets, duplicatesInFile, possibleDuplicates, countProblem,
    rows: out,
    summary: {
      total: out.length,
      invalid,
      warnings: out.filter((r) => r.warnings.length).length,
      existing: out.filter((r) => r.existing).length,
      toAdd: out.filter((r) => !r.existing && !Object.keys(r.errors).length).length,
      expectedCount: expected,
    },
    canApply: !missingColumns.length && !undecided.length && !dupTargets.length && !countProblem && invalid === 0 && duplicatesInFile.length === 0,
  };
}
