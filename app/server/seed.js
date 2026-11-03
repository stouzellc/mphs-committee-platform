// Initial records. `source` points at the v1 planning evidence; `demo: true` marks fictional fixtures.
// No real roster, contact or payment data belongs in this file.

const T = 'Tracker v1';
const now = '2026-10-25T12:00:00.000Z';

const rec = (o) => ({ version: 1, updatedAt: now, updatedBy: 'seed', ...o });

export function sourceRecords() {
  const decisions = [
    ['D001', 'Shared', 'Creative direction', 'Approved', 'Back to Pleasant and Pleasant, Beyond the Shore', 'User', '2026-10-25', 'Current chat'],
    ['D002', 'Shared', 'Document structure', 'Approved', 'Two decks, private CRM, tracker and committee handbook', 'User', '2026-10-25', 'Current chat'],
    ['D003', 'Shared', 'Google destination', 'Pending', 'owner@example.com access to verify', '', '', ''],
    ['D004', 'Shared', 'Event relationship', 'Pending', 'Companion cruise or alternative experience', '', '', ''],
    ['D005', 'Reunion', 'Date and venue', 'Pending', '', '', '', ''],
    ['D006', 'Reunion', 'Budget and ticketing', 'Pending', '', '', '', ''],
    ['D007', 'Cruise', 'Sailing and provider', 'Pending', '', '', '', ''],
    ['D008', 'Shared', 'Role titles', 'Pending', '', '', '', ''],
    ['D009', 'Shared', 'Roster verification', 'Pending', 'Original yearbook source needed', '', '', ''],
  ].map(([id, event, topic, status, text, approver, date, evidence], i) =>
    rec({ id, event, topic, status, text, approver, date, evidence, supersedes: '', supersededBy: '', source: `${T} Decisions!A${7 + i}` }));

  const tasks = [
    ['T001', 'Shared', 'Confirm role titles', 'High', 'D008'],
    ['T002', 'Shared', 'Locate original yearbook roster', 'High', 'D009'],
    ['T003', 'Reunion', 'Compare venue and date options', 'High', 'D005'],
    ['T004', 'Cruise', 'Agree survey and quote criteria', 'High', 'D004'],
    ['T005', 'Shared', 'Verify Google destination account', 'High', 'D003'],
    ['T006', 'Shared', 'Reconcile authoritative source versions', 'High', ''],
    ['T007', 'Shared', 'Review completed suite', 'Medium', ''],
    ['T008', 'Shared', 'Approve native Google import', 'Medium', 'D003'],
  ].map(([id, event, title, priority, dependency], i) =>
    rec({ id, event, title, owner: '', due: '', priority, status: 'Not started', dependency, notes: '', source: `${T} Tasks!A${7 + i}` }));

  const reunionCats = ['Venue', 'Food', 'Bar', 'Entertainment', 'Photography and video', 'Decor and signage', 'Insurance and security', 'Photo booth', 'Awards and recognition', 'Merchandise', 'Admin and platform fees', 'Other'];
  const cruiseCats = ['Group booking commitments', 'Welcome gathering', 'Onboard program and AV', 'Merch and keepsakes', 'Photography and video', 'Marketing and printing', 'Group insurance', 'Admin and platform fees', 'Other'];
  const budgetLines = [
    ...reunionCats.map((category, i) => rec({ id: `RB${String(i + 1).padStart(2, '0')}`, event: 'Reunion', category, estimate: null, actual: null, ref: '', source: `${T} 'Reunion Budget'!A${7 + i}` })),
    ...cruiseCats.map((category, i) => rec({ id: `CB${String(i + 1).padStart(2, '0')}`, event: 'Cruise', category, estimate: null, actual: null, ref: '', source: `${T} 'Cruise Budget'!A${7 + i}` })),
  ];
  const budgetSettings = [
    rec({ id: 'Reunion', reserveRate: 0.125, reserveStatus: 'Source planning assumption, not approved policy', estimateStatus: 'Pending approval', source: `${T} 'Reunion Budget'!H7` }),
    rec({ id: 'Cruise', reserveRate: 0.125, reserveStatus: 'Source planning assumption, not approved policy', estimateStatus: 'Pending approval', source: `${T} 'Cruise Budget'!H7` }),
  ];

  const program = ['Arrival and photos', 'Welcome', 'Dinner', 'School memories', 'Teacher appreciation', 'Memorial tribute', 'Awards', 'Dancing', 'Group photo']
    .map((segment, i) => rec({ id: `P${String(i + 1).padStart(2, '0')}`, event: 'Reunion', seq: i + 1, segment, start: '', duration: null, owner: '', status: 'Proposed', notes: '', source: `${T} Program!A${7 + i}` }));

  const merch = ['Hoodie', 'Varsity jacket', 'Cap', 'T-shirt', 'Challenge coin', 'Pin', 'Mug', 'Tumbler', 'Keychain', 'Pennant', 'Blanket']
    .map((item, i) => rec({ id: `M${String(i + 1).padStart(2, '0')}`, item, event: 'Shared', unitCost: null, sellPrice: null, qty: null, status: 'Concept', notes: '', source: `${T} Merch!A${7 + i}` }));

  const comms = [
    ['C001', 'Shared', 'Facebook Page', 'Page introduction and pinned update', 'Proposed'],
    ['C002', 'Shared', 'Instagram', 'Approved artwork and memory prompt', 'Proposed'],
    ['C003', 'Shared', 'Both', 'Invite classmates to share the pages', 'Proposed'],
    ['C004', 'Reunion', 'Both', 'Confirmed details and registration', 'Awaiting decisions'],
    ['C005', 'Cruise', 'Both', 'Interest update after survey approval', 'Awaiting decisions'],
  ].map(([id, event, channel, content, status], i) =>
    rec({ id, event, channel, content, status, owner: '', target: '', link: '', draft: '', notes: '', source: `${T} Communications!A${7 + i}` }));

  const tickets = [['Reunion', 'Early bird'], ['Reunion', 'Regular'], ['Reunion', 'Late'], ['Reunion', 'VIP'], ['Cruise', 'Group option']]
    .map(([event, tier], i) => rec({ id: `K${i + 1}`, event, tier, price: null, qty: null, status: 'Proposal', terms: '', source: `${T} Ticketing!A${7 + i}` }));

  const closeout = [
    'Photo gallery with permission', 'Highlight video with permission', 'Classmate and sponsor thanks', 'Feedback survey',
    'Memory book', 'Final financial reconciliation', 'Private archive and retention review',
  ].map((title, i) => rec({ id: `X${i + 1}`, event: 'Shared', title, done: false, owner: '', source: `${T} Closeout!B${7 + i}` }));

  return { decisions, tasks, budgetLines, budgetSettings, program, merch, comms, tickets, closeout, sponsors: [], quotes: [] };
}

// Fictional fixtures for exercising organizer workflows. Every record is flagged demo.
export function demoRecords() {
  const first = ['Avery', 'Jordan', 'Riley', 'Morgan', 'Casey', 'Quinn', 'Rowan', 'Skyler', 'Emerson', 'Harper', 'Reese', 'Dakota'];
  const people = first.map((f, i) => rec({
    alumniId: `DEMO-${String(i + 1).padStart(4, '0')}`,
    firstName: f,
    lastName: 'Demo Classmate',
    gradYear: 2008,
    email: `demo${i + 1}@example.invalid`,
    phone: `555-01${String(i).padStart(2, '0')}`,
    contactPermission: i % 3 === 0 ? 'Not recorded' : 'Email OK',
    optOut: i === 7,
    provenance: 'Fictional demo fixture',
    corrections: '',
    demo: true,
  }));
  const participation = [
    ['DEMO-0001', 'Reunion', 'RSVP yes', 150], ['DEMO-0002', 'Reunion', 'Interested', null],
    ['DEMO-0003', 'Reunion', 'RSVP yes', 150], ['DEMO-0004', 'Reunion', 'Declined', null],
    ['DEMO-0001', 'Cruise', 'Booked', 900], ['DEMO-0005', 'Cruise', 'Booked', 900],
    ['DEMO-0006', 'Cruise', 'Interested', null], ['DEMO-0003', 'Cruise', 'Booked', null],
  ].map(([alumniId, event, status, agreedTotal], i) => rec({ id: `PT${i + 1}`, alumniId, event, status, agreedTotal, guests: 0, cabinId: event === 'Cruise' && status === 'Booked' ? (i === 7 ? 'DEMO-CAB-B' : 'DEMO-CAB-A') : '', demo: true }));
  const cabins = [
    rec({ id: 'CAB1', cabinId: 'DEMO-CAB-A', capacity: 2, providerConfirmed: true, providerRef: 'DEMO-PROV-001', notes: 'Fictional', demo: true }),
    rec({ id: 'CAB2', cabinId: 'DEMO-CAB-B', capacity: 2, providerConfirmed: false, providerRef: '', notes: 'Fictional, awaiting provider', demo: true }),
  ];
  const ledger = [
    ['DTX-001', 'DPR-001', 'DEMO-0001', 'Reunion', 'Payment', 'Ticket', 150, 'Confirmed', 'Committee'],
    ['DTX-002', 'DPR-002', 'DEMO-0003', 'Reunion', 'Payment', 'Ticket', 150, 'Pending', 'Committee'],
    ['DTX-003', 'DPR-003', 'DEMO-0001', 'Cruise', 'Payment', 'Deposit', 250, 'Confirmed', 'Provider'],
    ['DTX-004', 'DPR-004', 'DEMO-0005', 'Cruise', 'Payment', 'Deposit', 250, 'Confirmed', 'Provider'],
    ['DTX-005', 'DPR-005', 'DEMO-0005', 'Cruise', 'Refund', 'Deposit', 250, 'Confirmed', 'Provider'],
  ].map(([txnId, providerRef, alumniId, event, type, kind, amount, status, receivedBy]) =>
    rec({ id: txnId, txnId, providerRef, alumniId, event, type, kind, amount, status, receivedBy, date: '2026-10-25', note: 'Fictional', demo: true }));
  const sponsors = [
    rec({ id: 'S-DEMO-1', business: 'Demo Business One', event: 'Reunion', tier: 'Demo tier', proposed: 500, committed: 500, status: 'Committed', benefit: 'Fictional', owner: '', receiptRef: '', demo: true }),
    rec({ id: 'S-DEMO-2', business: 'Demo Business Two', event: 'Reunion', tier: 'Demo tier', proposed: 1000, committed: null, status: 'Prospect', benefit: 'Fictional', owner: '', receiptRef: '', demo: true }),
    rec({ id: 'S-DEMO-3', business: 'Demo Business Three', event: 'Reunion', tier: 'Demo tier', proposed: 750, committed: null, status: 'Declined', benefit: 'Fictional', owner: '', receiptRef: '', demo: true }),
  ];
  const memories = [
    rec({ id: 'MEM-DEMO-1', title: 'Demo memory: the hallway lockers', story: 'Fictional example submission used to test moderation.', submittedBy: 'u-classmate', permission: true, approvedUse: 'Gallery', status: 'Submitted', demo: true }),
  ];
  return { people, participation, cabins, ledger, sponsors, memories };
}
