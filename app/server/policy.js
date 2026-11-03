// Server-side authorization: which permission reads/writes each collection, and which fields are redacted.
import { permissionsOf } from './auth.js';
import { parseMoney } from '../shared/finance.js';

const PLANNING = ['decisions', 'tasks', 'budgetLines', 'budgetSettings', 'program', 'merch', 'comms', 'tickets', 'closeout', 'sponsors', 'quotes'];

export const COLLECTIONS = {
  ...Object.fromEntries(PLANNING.map((c) => [c, { read: 'planning', write: 'planning' }])),
  people: { read: 'crm.view', write: 'crm.contact' },
  participation: { read: 'crm.view', write: 'crm.view' },
  cabins: { read: 'crm.view', write: 'crm.view' },
  ledger: { read: 'crm.finance', write: 'crm.finance' },
  memories: { read: 'memories.moderate', write: 'memories.moderate' },
};

const CONTACT_FIELDS = ['email', 'phone', 'contactPermission', 'optOut'];
const FINANCE_FIELDS = { participation: ['agreedTotal'] };

export const can = (user, perm) => permissionsOf(user).includes(perm);

export function redact(user, collection, record) {
  if (!record) return record;
  const r = { ...record };
  if (collection === 'people' && !can(user, 'crm.contact')) {
    for (const f of CONTACT_FIELDS) if (f in r) r[f] = '[restricted]';
  }
  for (const f of FINANCE_FIELDS[collection] || []) {
    if (!can(user, 'crm.finance') && f in r) r[f] = '[restricted]';
  }
  return r;
}

// Field schemas: type and allowed values. Unknown fields are rejected.
const S = (type, extra = {}) => ({ type, ...extra });
const EVENT = S('enum', { values: ['Reunion', 'Cruise', 'Shared'] });
const EV2 = S('enum', { values: ['Reunion', 'Cruise'] });
export const SCHEMAS = {
  decisions: { id: S('id'), event: EVENT, topic: S('text', { required: true }), status: S('enum', { values: ['Pending', 'Proposed', 'Approved', 'Superseded', 'Rejected'] }), text: S('text'), approver: S('text'), date: S('date'), evidence: S('text'), supersedes: S('text'), supersededBy: S('text'), source: S('text') },
  tasks: { id: S('id'), event: EVENT, title: S('text', { required: true }), owner: S('text'), due: S('date'), priority: S('enum', { values: ['High', 'Medium', 'Low'] }), status: S('enum', { values: ['Not started', 'In progress', 'Blocked', 'Done'] }), dependency: S('text'), notes: S('text'), source: S('text') },
  budgetLines: { id: S('id'), event: EV2, category: S('text', { required: true }), estimate: S('money'), actual: S('money'), ref: S('text'), source: S('text') },
  budgetSettings: { reserveRate: S('rate'), reserveStatus: S('text'), estimateStatus: S('text'), source: S('text') },
  program: { id: S('id'), event: EV2, seq: S('int'), segment: S('text', { required: true }), start: S('text'), duration: S('int'), owner: S('text'), status: S('enum', { values: ['Proposed', 'Approved', 'Cut'] }), notes: S('text'), source: S('text') },
  merch: { id: S('id'), item: S('text', { required: true }), event: EVENT, unitCost: S('money'), sellPrice: S('money'), qty: S('int'), status: S('enum', { values: ['Concept', 'Quoted', 'Approved', 'Ordered', 'Cut'] }), notes: S('text'), source: S('text') },
  comms: { id: S('id'), event: EVENT, channel: S('enum', { values: ['Facebook Page', 'Instagram', 'Both', 'Email'] }), content: S('text', { required: true }), status: S('enum', { values: ['Proposed', 'Drafting', 'Ready for review', 'Approved', 'Awaiting decisions', 'Posted manually'] }), owner: S('text'), target: S('date'), link: S('url'), draft: S('longtext'), notes: S('text'), source: S('text') },
  tickets: { id: S('id'), event: EV2, tier: S('text', { required: true }), price: S('money'), qty: S('int'), status: S('enum', { values: ['Proposal', 'Approved', 'Cut'] }), terms: S('text'), source: S('text') },
  closeout: { id: S('id'), event: EVENT, title: S('text', { required: true }), done: S('bool'), owner: S('text'), source: S('text') },
  sponsors: { id: S('id'), business: S('text', { required: true }), event: EV2, tier: S('text'), proposed: S('money'), committed: S('money'), status: S('enum', { values: ['Prospect', 'Proposed', 'Committed', 'Paid', 'Declined'] }), benefit: S('text'), owner: S('text'), receiptRef: S('text') },
  quotes: { id: S('id'), event: EV2, category: S('text', { required: true }), vendor: S('text', { required: true }), amount: S('money'), basis: S('enum', { values: ['Per person', 'Per cabin', 'Total'] }), occupancy: S('int'), quoteDate: S('date'), validUntil: S('date'), status: S('enum', { values: ['Requested', 'Received', 'Shortlisted', 'Selected', 'Rejected'] }), ref: S('text'), owner: S('text') },
  people: { alumniId: S('id'), firstName: S('text', { required: true }), lastName: S('text', { required: true }), gradYear: S('int'), email: S('text'), phone: S('text'), contactPermission: S('enum', { values: ['Not recorded', 'Email OK', 'Phone OK', 'Do not contact'] }), optOut: S('bool'), provenance: S('text'), corrections: S('text') },
  participation: { id: S('id'), alumniId: S('text', { required: true }), event: EV2, status: S('enum', { values: ['Invited', 'Interested', 'Not interested', 'RSVP yes', 'Declined', 'Booked', 'Cancelled'] }), agreedTotal: S('money'), guests: S('int'), cabinId: S('text') },
  cabins: { id: S('id'), cabinId: S('text', { required: true }), capacity: S('int'), providerConfirmed: S('bool'), providerRef: S('text'), notes: S('text') },
  ledger: { id: S('id'), txnId: S('text', { required: true }), providerRef: S('text'), alumniId: S('text'), event: EV2, type: S('enum', { values: ['Payment', 'Refund'] }), kind: S('enum', { values: ['Ticket', 'Deposit', 'Balance', 'Sponsorship', 'Merch', 'Other'] }), amount: S('money'), status: S('enum', { values: ['Pending', 'Confirmed', 'Failed', 'Void'] }), receivedBy: S('enum', { values: ['Provider', 'Committee'] }), date: S('date'), note: S('text') },
  memories: { status: S('enum', { values: ['Submitted', 'Approved', 'Rejected', 'Withdrawn'] }), showInGallery: S('bool'), approvedUse: S('text'), moderatorNote: S('text') },
};

export function validate(collection, input, { partial = false } = {}) {
  const schema = SCHEMAS[collection];
  const errors = {};
  const out = {};
  if (!schema) return { errors: { _: 'Unknown collection' }, value: null };
  for (const k of Object.keys(input)) {
    if (['version', 'updatedAt', 'updatedBy'].includes(k)) continue;
    if (!schema[k]) { errors[k] = 'Unknown field'; continue; }
    const f = schema[k];
    let v = input[k];
    switch (f.type) {
      case 'id': if (typeof v !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(v)) errors[k] = 'Use letters, numbers, - or _'; break;
      case 'text': if (v === null || v === undefined) v = ''; if (typeof v !== 'string' || v.length > 500) errors[k] = 'Text up to 500 characters'; else v = v.trim(); break;
      case 'longtext': if (v === null || v === undefined) v = ''; if (typeof v !== 'string' || v.length > 5000) errors[k] = 'Text up to 5000 characters'; break;
      case 'money': { const m = parseMoney(v); if (Number.isNaN(m)) errors[k] = 'Enter an amount like 1250 or 1250.50, or leave blank for Pending'; else if (m !== null && m < 0) errors[k] = 'Amount cannot be negative'; else v = m; break; }
      case 'rate': { const n = v === '' || v === null ? null : Number(v); if (n !== null && !(Number.isFinite(n) && n >= 0 && n <= 1)) errors[k] = 'Rate between 0 and 1'; else v = n; break; }
      case 'int': { if (v === '' || v === null || v === undefined) { v = null; break; } const n = Number(v); if (!Number.isInteger(n) || n < 0 || n > 100000) errors[k] = 'Whole number'; else v = n; break; }
      case 'bool': if (typeof v !== 'boolean') errors[k] = 'Yes or no'; break;
      case 'date': if (v === null || v === undefined) v = ''; if (v !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) errors[k] = 'Use YYYY-MM-DD'; break;
      case 'url': if (v === null || v === undefined) v = ''; if (v !== '' && !/^https:\/\/[^\s<>"']+$/.test(v)) errors[k] = 'Use an https:// link'; break;
      case 'enum': if (!f.values.includes(v)) errors[k] = `Choose one of: ${f.values.join(', ')}`; break;
      default: errors[k] = 'Unsupported';
    }
    out[k] = v;
  }
  if (!partial) for (const [k, f] of Object.entries(schema)) {
    if (f.required && (out[k] === undefined || out[k] === '')) errors[k] = 'Required';
  }
  return { errors, value: out };
}

export function writableFields(user, collection, value) {
  const blocked = [];
  if (collection === 'participation' && 'agreedTotal' in value && !can(user, 'crm.finance')) blocked.push('agreedTotal');
  return blocked;
}
