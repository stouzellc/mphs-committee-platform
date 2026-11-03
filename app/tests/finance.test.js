import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fin from '../shared/finance.js';
import { csvCell, toCsv } from '../server/csv.js';

const P = fin.PENDING;
const tx = (o) => ({ event: 'Cruise', type: 'Payment', status: 'Confirmed', receivedBy: 'Committee', amount: 100, ...o });

test('budget: blank estimates are unpriced and keep the total Pending', () => {
  const lines = Array.from({ length: 12 }, () => ({ estimate: null, actual: null }));
  const s = fin.budgetSummary(lines, 0.125);
  assert.equal(s.unpriced, 12);
  assert.equal(s.knownSubtotal, 0);
  assert.equal(s.totalWithReserve, P);
  assert.equal(s.reserveAmount, P);
});

test('budget: explicit zero counts as priced; complete estimate applies reserve', () => {
  const s = fin.budgetSummary([{ estimate: 1000 }, { estimate: 0 }, { estimate: 600 }], 0.125);
  assert.equal(s.unpriced, 0);
  assert.equal(s.pricedCount, 3);
  assert.equal(s.knownSubtotal, 1600);
  assert.equal(s.reserveAmount, 200);
  assert.equal(s.totalWithReserve, 1800);
});

test('budget: one unpriced line keeps total Pending but shows the known subtotal', () => {
  const s = fin.budgetSummary([{ estimate: 500 }, { estimate: null }], 0.125);
  assert.equal(s.knownSubtotal, 500);
  assert.equal(s.unpriced, 1);
  assert.equal(s.totalWithReserve, P);
});

test('budget: unknown reserve rate keeps total Pending; zero rate is valid', () => {
  assert.equal(fin.budgetSummary([{ estimate: 100 }], null).totalWithReserve, P);
  assert.equal(fin.budgetSummary([{ estimate: 100 }], 0).totalWithReserve, 100);
});

test('variance and funding gap stay Pending without both inputs', () => {
  assert.equal(fin.lineVariance({ estimate: 100, actual: null }), P);
  assert.equal(fin.lineVariance({ estimate: 100, actual: 120 }), 20);
  assert.equal(fin.fundingGap(P, 500), P);
  assert.equal(fin.fundingGap(1800, null), P);
  assert.equal(fin.fundingGap(1800, 500), 1300);
});

test('ledger: only confirmed counts; confirmed refunds subtract; pending is separate', () => {
  const s = fin.ledgerSummary([
    tx({ txnId: 'A', amount: 250 }),
    tx({ txnId: 'B', amount: 100, status: 'Pending' }),
    tx({ txnId: 'C', amount: 50, type: 'Refund' }),
    tx({ txnId: 'D', amount: 75, status: 'Void' }),
    tx({ txnId: 'E', amount: 40, type: 'Refund', status: 'Pending' }),
  ]);
  assert.equal(s.confirmedPayments, 250);
  assert.equal(s.confirmedRefunds, 50);
  assert.equal(s.netReceipts, 200);
  assert.equal(s.pendingNet, 60);
});

test('ledger: duplicate transaction IDs or provider refs are held, not counted', () => {
  const s = fin.ledgerSummary([
    tx({ txnId: 'A', providerRef: 'P1', amount: 100 }),
    tx({ txnId: 'A', providerRef: 'P2', amount: 100 }),
    tx({ txnId: 'B', providerRef: 'P3', amount: 30 }),
    tx({ txnId: 'C', providerRef: 'P3', amount: 30 }),
    tx({ txnId: 'D', providerRef: 'P4', amount: 10 }),
  ]);
  assert.equal(s.netReceipts, 10);
  assert.equal(s.heldForReview, 4);
  assert.deepEqual(s.duplicateIssues.map((i) => i.field).sort(), ['providerRef', 'txnId']);
});

test('ledger: invalid or negative amounts are held for review', () => {
  const s = fin.ledgerSummary([tx({ txnId: 'A', amount: -5 }), tx({ txnId: 'B', amount: null }), tx({ txnId: 'C', amount: 20 })]);
  assert.equal(s.netReceipts, 20);
  assert.equal(s.heldForReview, 2);
});

test('ledger: provider and committee receipts are reported separately and filtered by event', () => {
  const txns = [tx({ txnId: 'A', amount: 300, receivedBy: 'Provider' }), tx({ txnId: 'B', amount: 120, receivedBy: 'Committee' }), tx({ txnId: 'C', amount: 999, event: 'Reunion' })];
  const s = fin.ledgerSummary(txns, { event: 'Cruise' });
  assert.equal(s.receivedByProvider, 300);
  assert.equal(s.receivedByCommittee, 120);
  assert.equal(s.netReceipts, 420);
});

test('person balance: missing agreed total is Pending, never zero or paid', () => {
  const b = fin.personBalance(null, [tx({ txnId: 'A', amount: 250 })]);
  assert.equal(b.balance, P);
  assert.match(b.status, /Pending/);
  assert.equal(b.net, 250);
});

test('person balance: paid in full, balance due and overpaid', () => {
  assert.equal(fin.personBalance(150, [tx({ txnId: 'A', amount: 150 })]).status, 'Paid in full');
  const due = fin.personBalance(900, [tx({ txnId: 'A', amount: 250 })]);
  assert.equal(due.balance, 650);
  assert.equal(due.status, 'Balance due');
  assert.match(fin.personBalance(100, [tx({ txnId: 'A', amount: 120 })]).status, /Overpaid/);
});

test('person balance: refunded deposit keeps a historical label and zero net', () => {
  const b = fin.personBalance(900, [tx({ txnId: 'A', amount: 250, kind: 'Deposit' }), tx({ txnId: 'B', amount: 250, kind: 'Deposit', type: 'Refund' })]);
  assert.equal(b.net, 0);
  assert.equal(b.balance, 900);
  assert.match(b.depositRecord, /historical/);
  assert.equal(b.status, 'No net receipts');
});

test('cabins: two travelers in one confirmed Cabin ID count as one cabin', () => {
  const s = fin.cabinSummary([{ cabinId: 'C1', capacity: 2, providerConfirmed: true }], [{ cabinId: 'C1' }, { cabinId: 'C1' }]);
  assert.equal(s.bookedCabins, 1);
  assert.equal(s.travelersInBookedCabins, 2);
});

test('cabins: duplicate Cabin IDs are flagged and not counted; unconfirmed not booked', () => {
  const s = fin.cabinSummary(
    [{ cabinId: 'C1', providerConfirmed: true }, { cabinId: 'C1', providerConfirmed: true }, { cabinId: 'C2', providerConfirmed: false }, { cabinId: 'C3', providerConfirmed: true, capacity: 2 }],
    [{ cabinId: 'C3' }, { cabinId: 'C3' }, { cabinId: 'C3' }, { cabinId: 'C9' }],
  );
  assert.equal(s.bookedCabins, 1);
  assert.deepEqual(s.duplicates, [{ cabinId: 'C1', count: 2 }]);
  assert.equal(s.unconfirmedCabins, 1);
  assert.deepEqual(s.overCapacity, [{ cabinId: 'C3', travelers: 3, capacity: 2 }]);
  assert.deepEqual(s.unknownCabinRefs, ['C9']);
});

test('sponsors: only Committed and Paid count; prospects and declines stay out', () => {
  const s = fin.sponsorSummary([
    { event: 'Reunion', status: 'Committed', proposed: 500, committed: 500 },
    { event: 'Reunion', status: 'Paid', proposed: 300, committed: 250 },
    { event: 'Reunion', status: 'Prospect', proposed: 1000, committed: null },
    { event: 'Reunion', status: 'Declined', proposed: 750, committed: 750 },
    { event: 'Cruise', status: 'Committed', proposed: 900, committed: 900 },
  ], 'Reunion');
  assert.equal(s.committed, 750);
  assert.equal(s.pipelineProposed, 1000);
  assert.equal(s.declinedCount, 1);
});

test('quotes: per-person needs occupancy for per-cabin quotes; totals stay Pending', () => {
  assert.equal(fin.quotePerPerson({ amount: 1800, basis: 'Per cabin', occupancy: 2 }), 900);
  assert.equal(fin.quotePerPerson({ amount: 1800, basis: 'Per cabin', occupancy: null }), P);
  assert.equal(fin.quotePerPerson({ amount: 700, basis: 'Per person' }), 700);
  assert.equal(fin.quotePerPerson({ amount: 9000, basis: 'Total' }), P);
  assert.equal(fin.quotePerPerson({ amount: null, basis: 'Per person' }), P);
});

test('merch margin is Pending until both prices exist', () => {
  assert.equal(fin.merchMargin({ unitCost: 12, sellPrice: null }), P);
  assert.equal(fin.merchMargin({ unitCost: 12, sellPrice: 25 }), 13);
});

test('money parsing accepts plain amounts and rejects junk', () => {
  assert.equal(fin.parseMoney(''), null);
  assert.equal(fin.parseMoney('$1,250.50'), 1250.5);
  assert.equal(fin.parseMoney('0'), 0);
  assert.ok(Number.isNaN(fin.parseMoney('12abc')));
  assert.ok(Number.isNaN(fin.parseMoney('1.234')));
});

test('CSV export neutralises spreadsheet formulas and quotes safely', () => {
  assert.equal(csvCell('=SUM(A1)'), "'=SUM(A1)");
  assert.equal(csvCell('+1'), "'+1");
  assert.equal(csvCell('-2'), "'-2");
  assert.equal(csvCell('@cmd'), "'@cmd");
  assert.equal(csvCell('a,"b"'), '"a,""b"""');
  assert.equal(toCsv([{ a: 1, b: '=x' }]), "a,b\r\n1,'=x\r\n");
});
