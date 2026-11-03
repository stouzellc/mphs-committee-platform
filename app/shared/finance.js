// Pure planning/finance rules shared by the server and the browser.
// "Pending" means a required input is unknown; it is never coerced to zero.

export const PENDING = 'Pending';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const round2 = (n) => Math.round(n * 100) / 100;

export function parseMoney(input) {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') return Number.isFinite(input) ? input : NaN;
  const s = String(input).trim().replace(/[$,\s]/g, '');
  if (s === '') return null;
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return NaN;
  return Number(s);
}

export function budgetSummary(lines, reserveRate) {
  const priced = lines.filter((l) => isNum(l.estimate));
  const unpriced = lines.length - priced.length;
  const knownSubtotal = round2(priced.reduce((s, l) => s + l.estimate, 0));
  const actualLines = lines.filter((l) => isNum(l.actual));
  const actualSubtotal = round2(actualLines.reduce((s, l) => s + l.actual, 0));
  const rateKnown = isNum(reserveRate);
  const totalWithReserve = unpriced > 0 || !rateKnown ? PENDING : round2(knownSubtotal * (1 + reserveRate));
  const reserveAmount = totalWithReserve === PENDING ? PENDING : round2(knownSubtotal * reserveRate);
  return {
    categories: lines.length,
    pricedCount: priced.length,
    unpriced,
    knownSubtotal,
    actualSubtotal,
    actualRecorded: actualLines.length,
    reserveRate: rateKnown ? reserveRate : PENDING,
    reserveAmount,
    totalWithReserve,
  };
}

export function lineVariance(line) {
  return isNum(line.estimate) && isNum(line.actual) ? round2(line.actual - line.estimate) : PENDING;
}

export function fundingGap(totalWithReserve, netReceipts) {
  if (!isNum(totalWithReserve) || !isNum(netReceipts)) return PENDING;
  return round2(totalWithReserve - netReceipts);
}

// Ledger: one authoritative list of payments and refunds.
// Amounts are stored positive; type decides the sign. Only confirmed records count.
export function findLedgerDuplicates(txns) {
  const byTxn = new Map();
  const byRef = new Map();
  for (const t of txns) {
    const id = String(t.txnId || '').trim().toUpperCase();
    const ref = String(t.providerRef || '').trim().toUpperCase();
    if (id) byTxn.set(id, [...(byTxn.get(id) || []), t]);
    if (ref) byRef.set(ref, [...(byRef.get(ref) || []), t]);
  }
  const conflicted = new Set();
  const issues = [];
  for (const [k, list] of byTxn) if (list.length > 1) { issues.push({ field: 'txnId', value: k, count: list.length }); list.forEach((t) => conflicted.add(t)); }
  for (const [k, list] of byRef) if (list.length > 1) { issues.push({ field: 'providerRef', value: k, count: list.length }); list.forEach((t) => conflicted.add(t)); }
  return { issues, conflicted };
}

export function ledgerSummary(txns, { event } = {}) {
  const scoped = event ? txns.filter((t) => t.event === event) : txns.slice();
  const { issues, conflicted } = findLedgerDuplicates(scoped);
  const clean = scoped.filter((t) => !conflicted.has(t) && isNum(t.amount) && t.amount >= 0);
  const invalid = scoped.filter((t) => !conflicted.has(t) && !(isNum(t.amount) && t.amount >= 0));
  const sum = (arr) => round2(arr.reduce((s, t) => s + t.amount, 0));
  const confirmed = clean.filter((t) => t.status === 'Confirmed');
  const payments = confirmed.filter((t) => t.type === 'Payment');
  const refunds = confirmed.filter((t) => t.type === 'Refund');
  const pending = clean.filter((t) => t.status === 'Pending');
  const net = (arr) => round2(sum(arr.filter((t) => t.type === 'Payment')) - sum(arr.filter((t) => t.type === 'Refund')));
  return {
    confirmedPayments: sum(payments),
    confirmedRefunds: sum(refunds),
    netReceipts: round2(sum(payments) - sum(refunds)),
    pendingNet: net(pending),
    receivedByProvider: net(confirmed.filter((t) => t.receivedBy === 'Provider')),
    receivedByCommittee: net(confirmed.filter((t) => t.receivedBy === 'Committee')),
    countedRecords: confirmed.length,
    heldForReview: conflicted.size + invalid.length,
    duplicateIssues: issues,
  };
}

export function personBalance(agreedTotal, txns) {
  const s = ledgerSummary(txns);
  const net = s.netReceipts;
  const hadDeposit = txns.some((t) => t.status === 'Confirmed' && t.type === 'Payment' && t.kind === 'Deposit');
  const depositRecord = hadDeposit ? 'Deposit payment recorded (historical record; not proof it is still held)' : 'No deposit payment recorded';
  if (!isNum(agreedTotal)) {
    return { net, balance: PENDING, status: 'Pending: no agreed total', depositRecord, heldForReview: s.heldForReview };
  }
  const balance = round2(agreedTotal - net);
  let status = 'Balance due';
  if (balance === 0) status = 'Paid in full';
  else if (balance < 0) status = 'Overpaid: review refund';
  else if (net <= 0) status = 'No net receipts';
  return { net, balance, status, depositRecord, heldForReview: s.heldForReview };
}

// One booked cabin per unique Cabin ID with provider confirmation.
export function cabinSummary(cabins, assignments) {
  const byId = new Map();
  for (const c of cabins) {
    const id = (c.cabinId || '').trim();
    if (!id) continue;
    byId.set(id, [...(byId.get(id) || []), c]);
  }
  const duplicates = [...byId].filter(([, list]) => list.length > 1).map(([id, list]) => ({ cabinId: id, count: list.length }));
  const dupIds = new Set(duplicates.map((d) => d.cabinId));
  const confirmedIds = new Set(
    [...byId].filter(([id, list]) => !dupIds.has(id) && list[0].providerConfirmed === true).map(([id]) => id),
  );
  const occupancy = new Map();
  const unknownCabinRefs = [];
  for (const a of assignments) {
    if (!a.cabinId) continue;
    if (!byId.has(a.cabinId)) { unknownCabinRefs.push(a.cabinId); continue; }
    occupancy.set(a.cabinId, (occupancy.get(a.cabinId) || 0) + 1);
  }
  const overCapacity = [];
  for (const [id, n] of occupancy) {
    const cap = byId.get(id)[0].capacity;
    if (isNum(cap) && n > cap) overCapacity.push({ cabinId: id, travelers: n, capacity: cap });
  }
  const travelersInBooked = [...occupancy].filter(([id]) => confirmedIds.has(id)).reduce((s, [, n]) => s + n, 0);
  return {
    bookedCabins: confirmedIds.size,
    travelersInBookedCabins: travelersInBooked,
    unconfirmedCabins: [...byId.keys()].filter((id) => !dupIds.has(id) && !confirmedIds.has(id)).length,
    duplicates,
    overCapacity,
    unknownCabinRefs: [...new Set(unknownCabinRefs)],
  };
}

export const SPONSOR_COUNTED = ['Committed', 'Paid'];
export const SPONSOR_PIPELINE = ['Prospect', 'Proposed'];

export function sponsorSummary(sponsors, event) {
  const scoped = sponsors.filter((s) => !event || s.event === event);
  const sum = (arr, f) => round2(arr.reduce((t, s) => t + (isNum(s[f]) ? s[f] : 0), 0));
  const counted = scoped.filter((s) => SPONSOR_COUNTED.includes(s.status));
  const pipeline = scoped.filter((s) => SPONSOR_PIPELINE.includes(s.status));
  return {
    committed: sum(counted, 'committed'),
    committedMissingAmount: counted.filter((s) => !isNum(s.committed)).length,
    pipelineProposed: sum(pipeline, 'proposed'),
    declinedCount: scoped.filter((s) => s.status === 'Declined').length,
    count: scoped.length,
  };
}

// Quote comparison: always state the basis. Per-person needs occupancy for per-cabin quotes.
export function quotePerPerson(q) {
  if (!isNum(q.amount)) return PENDING;
  if (q.basis === 'Per person') return round2(q.amount);
  if (q.basis === 'Per cabin') return isNum(q.occupancy) && q.occupancy > 0 ? round2(q.amount / q.occupancy) : PENDING;
  return PENDING;
}

export function merchMargin(item) {
  return isNum(item.unitCost) && isNum(item.sellPrice) ? round2(item.sellPrice - item.unitCost) : PENDING;
}

export function fmtMoney(v) {
  if (!isNum(v)) return PENDING;
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}
