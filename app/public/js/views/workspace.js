import { $, $$, esc, pill, demoPill, money, orPending, toast, setTitle, memoryPhoto } from '../ui.js';
import { req, has, currentUser } from '../api.js';
import { crudTable, openEditor } from './ws-crud.js';
import * as fin from '/shared/finance.js';
import { art } from '../content.js';

const EV = ['Reunion', 'Cruise', 'Shared'];
const EV2 = ['Reunion', 'Cruise'];
const PENDING_INPUTS = ['Reunion date', 'Venue', 'Headcount target', 'Budget approval', 'Ticket prices', 'Ticketing platform', 'Cruise provider and ship', 'Departure port', 'Sailing dates', 'Duration', 'Fare and occupancy basis', 'Deposit and cancellation terms', 'Relationship between reunion and cruise', 'Formal organizer titles', 'Yearbook reconciliation'];

const MODULES = [
  ['Planning', 'overview', 'Overview', 'planning'],
  ['Planning', 'decisions', 'Decisions', 'planning'],
  ['Planning', 'tasks', 'Tasks', 'planning'],
  ['Planning', 'budgets', 'Budgets & tickets', 'planning'],
  ['Planning', 'sponsors', 'Sponsors', 'planning'],
  ['Planning', 'vendors', 'Vendors & quotes', 'planning'],
  ['Planning', 'program', 'Run of show', 'planning'],
  ['Planning', 'merch', 'Merchandise', 'planning'],
  ['Planning', 'comms', 'Communications', 'planning'],
  ['Planning', 'closeout', 'Closeout', 'planning'],
  ['Planning', 'activity', 'Activity log', 'planning'],
  ['Restricted', 'crm', 'Classmate records', 'crm.view'],
  ['Restricted', 'cabins', 'Cabins', 'crm.view'],
  ['Restricted', 'ledger', 'Ledger & balances', 'crm.finance'],
  ['Restricted', 'memories', 'Memory review', 'memories.moderate'],
  ['Restricted', 'access', 'Access', 'admin.users'],
];

const head = (title, desc, tools = '') => `<div class="ws-head"><div><p class="kicker">Organizer workspace</p><h1>${esc(title)}</h1><p>${desc}</p></div><div class="tools">${tools}</div></div>`;
const exportBtn = (c) => `<a class="btn btn-sm btn-ghost" href="/api/export/${c}.csv" download>Export CSV</a>`;
const addBtn = (label = 'Add') => `<button type="button" class="btn btn-sm" data-add>${esc(label)}</button>`;
const kpi = (lbl, val, sub = '', pending = false) => `<div class="kpi"><span class="lbl">${esc(lbl)}</span><span class="val ${pending ? 'pending' : ''}">${val}</span>${sub ? `<span class="sub">${sub}</span>` : ''}</div>`;
const isPend = (v) => v === fin.PENDING || v === null || v === undefined;
const restricted = (v) => (v === '[restricted]' ? '<span class="pill pill-restricted">Restricted</span>' : null);

export async function renderWorkspace(main, mod) {
  setTitle('Organizer workspace');
  const u = currentUser();
  if (!u) {
    main.innerHTML = `<div class="narrow"><div class="card"><h1>Organizers</h1><p>The workspace holds decisions, budgets and restricted classmate records. Sign in with an organizer account.</p><a class="btn" href="#/login?next=workspace/${esc(mod)}">Sign in</a></div></div>`;
    return;
  }
  if (!has('planning')) {
    main.innerHTML = `<div class="denied"><h2>Organizer access required</h2><p>Your account (${esc(u.role)}) can manage your own plans and memories.</p><a class="btn" href="#/me">Go to my plans</a></div>`;
    return;
  }
  const def = MODULES.find((m) => m[1] === mod) || MODULES[0];
  const groups = [...new Set(MODULES.map((m) => m[0]))];
  main.innerHTML = `
    <div class="ws">
      <aside class="ws-side" id="wsSide">
        <div class="ws-who"><strong>${esc(u.displayName)}</strong>${esc(u.role)}${u.demo ? ' · <span class="pill pill-demo">Demo</span>' : ''}</div>
        <button type="button" class="btn btn-sm btn-ghost ws-sidebar-toggle" aria-expanded="false" aria-controls="wsNav">Sections: ${esc(def[2])}</button>
        <nav id="wsNav" aria-label="Workspace sections">
          ${groups.map((g) => `<h2>${g}</h2>${MODULES.filter((m) => m[0] === g).map((m) => `<a href="#/workspace/${m[1]}" ${m[1] === def[1] ? 'aria-current="page"' : ''}>${esc(m[2])}${has(m[3]) ? '' : '<span class="lock">No access</span>'}</a>`).join('')}`).join('')}
        </nav>
      </aside>
      <div class="ws-main" id="wsMain"></div>
    </div>`;
  const tog = $('.ws-sidebar-toggle', main);
  tog.addEventListener('click', () => { const o = $('#wsSide', main).classList.toggle('open'); tog.setAttribute('aria-expanded', String(o)); });
  const host = $('#wsMain', main);
  if (!has(def[3])) {
    host.innerHTML = `${head(def[2], 'This section is restricted.')}<div class="panel"><div class="empty"><h3>No access</h3><p>Your account lacks the <code>${esc(def[3])}</code> permission. The server refuses these records too; hiding this page is not what protects them. An administrator can grant access.</p></div></div>`;
    return;
  }
  await VIEWS[def[1]](host);
}

const VIEWS = {
  async overview(host) {
    host.innerHTML = head('Overview', 'Reunion and cruise status side by side. Every figure comes from records in this workspace; unknowns stay Pending.') + '<p class="muted">Loading…</p>';
    const [s, t] = await Promise.all([req('GET', '/api/summary'), req('GET', '/api/c/tasks')]);
    if (!s.ok) { host.innerHTML += `<p class="notice notice-crimson">${esc(s.data.error)}</p>`; return; }
    const S = s.data;
    const card = (ev) => {
      const e = S[ev], b = e.budget;
      const net = e.ledger ? e.ledger.netReceipts : null;
      const held = e.ledger ? e.ledger.receivedByCommittee : null;
      const gap = e.ledger ? fin.fundingGap(b.totalWithReserve, held) : null;
      const row = (l, v, p = false) => `<div class="row"><span>${l}</span><span class="v ${p ? 'pending' : ''}">${v}</span></div>`;
      return `
      <section class="ev-card ${ev === 'Cruise' ? 'cruise-card' : ''}" aria-labelledby="ev-${ev}">
        <header><h2 id="ev-${ev}">${ev === 'Reunion' ? 'Back to Pleasant' : 'Pleasant, Beyond the Shore'}</h2>${pill('Pending', 'Logistics pending')}</header>
        <div class="rows">
          ${row('Known estimate subtotal', money(b.knownSubtotal))}
          ${row('Unpriced budget categories', `${b.unpriced} of ${b.categories}`, b.unpriced > 0)}
          ${row(`Total incl. ${typeof b.reserveRate === 'number' ? `${Math.round(b.reserveRate * 1000) / 10}% ` : ''}reserve <span class="muted">(assumption)</span>`, money(b.totalWithReserve), isPend(b.totalWithReserve))}
          ${row('Sponsor commitments <span class="muted">(Committed + Paid)</span>', money(e.sponsors.committed))}
          ${row('Sponsor pipeline <span class="muted">(not counted)</span>', money(e.sponsors.pipelineProposed))}
          ${e.ledger ? row('Net confirmed receipts <span class="muted">(ledger)</span>', money(net)) : row('Net confirmed receipts', '<span class="pill pill-restricted">Finance access</span>')}
          ${e.ledger ? row('Received by committee <span class="muted">(net)</span>', money(held)) : ''}
          ${e.ledger ? row('Funding gap <span class="muted">(total − committee-held)</span>', money(gap), isPend(gap)) : ''}
          ${e.ledger && e.ledger.heldForReview ? row('Ledger records held for review', String(e.ledger.heldForReview), true) : ''}
          ${row('Open decisions (incl. shared)', String(e.openDecisions), e.openDecisions > 0)}
          ${row('Open tasks (incl. shared)', String(e.tasksOpen))}
          ${ev === 'Cruise' && S.cabins ? row('Booked cabins <span class="muted">(unique, provider-confirmed)</span>', String(S.cabins.bookedCabins)) : ''}
          ${ev === 'Cruise' && S.cabins && S.cabins.duplicates.length ? row('Duplicate Cabin IDs flagged', String(S.cabins.duplicates.length), true) : ''}
        </div>
      </section>`;
    };
    const bars = EV2.map((ev) => { const b = S[ev].budget; const pct = b.categories ? (b.pricedCount / b.categories) * 100 : 0; return `<div class="bar-row"><span>${ev}</span><div class="bar-track" role="img" aria-label="${ev}: ${b.pricedCount} of ${b.categories} categories priced"><div class="bar-fill" data-w="${pct}"></div></div><span class="n">${b.pricedCount}/${b.categories}</span></div>`; }).join('');
    const tStatus = Object.entries(S.tasks);
    const tTotal = tStatus.reduce((a, [, n]) => a + n, 0) || 1;
    const tBars = tStatus.map(([k, n]) => `<div class="bar-row"><span>${esc(k)}</span><div class="bar-track" role="img" aria-label="${esc(k)}: ${n} tasks"><div class="bar-fill" data-w="${(n / tTotal) * 100}"></div></div><span class="n">${n}</span></div>`).join('');
    const next = t.ok ? t.data.records.filter((x) => x.status !== 'Done').sort((a, b) => ({ High: 0, Medium: 1, Low: 2 }[a.priority] - { High: 0, Medium: 1, Low: 2 }[b.priority])).slice(0, 5) : [];
    host.innerHTML = head('Overview', 'Reunion and cruise status side by side. Every figure comes from records in this workspace; unknowns stay Pending.', exportBtn('decisions')) + `
      <p class="notice"><span class="pill pill-demo">Demo</span> Sponsor, ledger and cabin figures in this local build come from fictional demo fixtures. Decisions, tasks, budget categories, program, merchandise and communications are the v1 tracker records.</p>
      <div class="ev-cols">${card('Reunion')}${card('Cruise')}</div>
      <div class="ev-cols mt-24">
        <section class="panel"><header><h2>Are the budgets ready to approve?</h2><a href="#/workspace/budgets" class="linkbtn">Open budgets</a></header>
          <div class="body"><p class="muted">Categories with an estimate (including an explicit 0). The total stays Pending until every category is priced.</p><div class="bar-chart">${bars}</div></div></section>
        <section class="panel"><header><h2>Where is the work?</h2><a href="#/workspace/tasks" class="linkbtn">Open tasks</a></header>
          <div class="body"><div class="bar-chart">${tBars}</div></div></section>
      </div>
      <div class="ev-cols">
        <section class="panel"><header><h2>Next high-priority tasks</h2></header><div class="body">
          ${next.length ? `<ul class="history">${next.map((x) => `<li><strong>${esc(x.id)} · ${esc(x.title)}</strong><span class="muted">${esc(x.event)} · ${esc(x.priority)} · owner ${x.owner ? esc(x.owner) : 'unassigned'} · due ${x.due ? esc(x.due) : 'not set'}${x.dependency ? ` · waits on ${esc(x.dependency)}` : ''}</span></li>`).join('')}</ul>` : '<p class="muted">No open tasks.</p>'}
        </div></section>
        <section class="panel"><header><h2>Pending inputs (${PENDING_INPUTS.length})</h2></header><div class="body">
          <p class="muted">From the approved project facts. Fill these through Decisions; nothing here is inferred.</p>
          <div class="hb-links">${PENDING_INPUTS.map((p) => pill('Pending', p)).join('')}</div>
        </div></section>
      </div>`;
    $$('.bar-fill', host).forEach((b) => { b.style.width = `${b.dataset.w}%`; });
  },

  async decisions(host) {
    host.innerHTML = head('Decisions', 'The register of approved facts and open questions. Approval needs an approver, a date and evidence. Changed decisions are superseded, never overwritten.', `${exportBtn('decisions')}${addBtn('New decision')}`) + '<div data-t></div>';
    const statuses = ['Pending', 'Proposed', 'Approved', 'Superseded', 'Rejected'];
    const t = await crudTable($('[data-t]', host), {
      collection: 'decisions', noun: 'Decision', titleKey: 'topic', search: ['id', 'topic', 'text', 'approver'], searchLabel: 'Search decisions…',
      filters: [{ key: 'event', label: 'Event', options: EV }, { key: 'status', label: 'Status', options: statuses }],
      sort: (a, b) => a.id.localeCompare(b.id),
      columns: [
        { key: 'id', label: 'ID' }, { key: 'event', label: 'Event' }, { key: 'topic', label: 'Topic', render: (r) => `<strong>${esc(r.topic)}</strong>${demoPill(r)}` },
        { key: 'status', label: 'Status', render: (r) => pill(r.status) },
        { key: 'text', label: 'Decision or question', render: (r) => esc(r.text) || '<span class="muted">—</span>' },
        { key: 'approver', label: 'Approver', render: (r) => esc(r.approver) || '<span class="muted">—</span>' },
        { key: 'date', label: 'Date', render: (r) => esc(r.date) || '<span class="muted">—</span>' },
        { key: 'links', label: 'Links', render: (r) => [r.supersedes && `replaces ${esc(r.supersedes)}`, r.supersededBy && `replaced by ${esc(r.supersededBy)}`].filter(Boolean).join('<br>') || `<span class="src-ref">${esc(r.source || '')}</span>` },
      ],
      fields: [
        { key: 'event', label: 'Event', type: 'select', options: EV },
        { key: 'topic', label: 'Topic', type: 'text', required: true },
        { key: 'status', label: 'Status', type: 'select', options: statuses, hint: 'Approved requires approver, date and evidence.' },
        { key: 'text', label: 'Decision or question', type: 'textarea', max: 500 },
        { key: 'approver', label: 'Approver', type: 'text' },
        { key: 'date', label: 'Decision date', type: 'date' },
        { key: 'evidence', label: 'Evidence', type: 'text', hint: 'Where the approval is recorded (meeting notes, message, document).' },
        { key: 'supersedes', label: 'Supersedes decision ID', type: 'text' },
        { key: 'supersededBy', label: 'Superseded by decision ID', type: 'text' },
      ],
      defaults: () => ({ event: 'Shared', status: 'Pending' }),
    });
    $('[data-add]', host).onclick = t.add;
  },

  async tasks(host) {
    let view = sessionStorage.getItem('mphs-task-view') || 'list';
    host.innerHTML = head('Tasks', 'Committee work from the tracker. Owners and due dates are blank until assigned.', `<div class="seg" role="group" aria-label="Task view"><button type="button" data-v="list" aria-pressed="${view === 'list'}">List</button><button type="button" data-v="board" aria-pressed="${view === 'board'}">Board</button></div>${exportBtn('tasks')}${addBtn('New task')}`) + '<div data-t></div>';
    const statuses = ['Not started', 'In progress', 'Blocked', 'Done'];
    const t = await crudTable($('[data-t]', host), {
      collection: 'tasks', noun: 'Task', titleKey: 'title', search: ['id', 'title', 'owner', 'notes'], searchLabel: 'Search tasks…',
      filters: [{ key: 'event', label: 'Event', options: EV }, { key: 'status', label: 'Status', options: statuses }, { key: 'priority', label: 'Priority', options: ['High', 'Medium', 'Low'] }],
      sort: (a, b) => a.id.localeCompare(b.id),
      view: () => view,
      columns: [
        { key: 'id', label: 'ID' }, { key: 'event', label: 'Event' }, { key: 'title', label: 'Task', render: (r) => `<strong>${esc(r.title)}</strong>` },
        { key: 'owner', label: 'Owner', render: (r) => esc(r.owner) || '<span class="muted">Unassigned</span>' },
        { key: 'due', label: 'Due', render: (r) => esc(r.due) || '<span class="muted">Not set</span>' },
        { key: 'priority', label: 'Priority' }, { key: 'status', label: 'Status', render: (r) => pill(r.status) },
        { key: 'dependency', label: 'Waits on', render: (r) => esc(r.dependency) || '<span class="muted">—</span>' },
      ],
      fields: [
        { key: 'title', label: 'Task', type: 'text', required: true },
        { key: 'event', label: 'Event', type: 'select', options: EV },
        { key: 'owner', label: 'Owner', type: 'text' },
        { key: 'due', label: 'Due date', type: 'date' },
        { key: 'priority', label: 'Priority', type: 'select', options: ['High', 'Medium', 'Low'] },
        { key: 'status', label: 'Status', type: 'select', options: statuses },
        { key: 'dependency', label: 'Depends on (decision or task ID)', type: 'text' },
        { key: 'notes', label: 'Notes', type: 'textarea', max: 500 },
      ],
      defaults: () => ({ event: 'Shared', priority: 'Medium', status: 'Not started' }),
      renderAlt(body, list, { edit, reload }) {
        body.innerHTML = `<div class="board-cols">${statuses.map((s, si) => {
          const items = list.filter((x) => x.status === s);
          return `<section class="board-col" aria-label="${s}"><h3>${s}<span>${items.length}</span></h3>${items.map((x) => `
            <article class="task-card"><h4>${esc(x.title)}</h4>
              <div class="meta"><span>${esc(x.id)}</span><span>${esc(x.event)}</span>${pill(x.priority === 'High' ? 'Blocked' : 'Not started', x.priority)}<span>${x.owner ? esc(x.owner) : 'Unassigned'}</span></div>
              <div class="move">
                <button type="button" data-move="${esc(x.id)}" data-to="${si - 1}" ${si === 0 ? 'disabled' : ''} aria-label="Move ${esc(x.title)} to ${statuses[si - 1] || ''}">← ${statuses[si - 1] || ''}</button>
                <button type="button" data-open="${esc(x.id)}">Edit</button>
                <button type="button" data-move="${esc(x.id)}" data-to="${si + 1}" ${si === statuses.length - 1 ? 'disabled' : ''} aria-label="Move ${esc(x.title)} to ${statuses[si + 1] || ''}">${statuses[si + 1] || ''} →</button>
              </div></article>`).join('') || '<p class="muted">No tasks</p>'}</section>`;
        }).join('')}</div>`;
        $$('[data-open]', body).forEach((b) => b.onclick = () => edit(list.find((x) => x.id === b.dataset.open)));
        $$('[data-move]', body).forEach((b) => b.onclick = async () => {
          const rec = list.find((x) => x.id === b.dataset.move);
          const to = statuses[Number(b.dataset.to)];
          const r = await req('PATCH', `/api/c/tasks/${encodeURIComponent(rec.id)}`, { status: to, version: rec.version });
          if (r.ok) toast(`${rec.id} moved to ${to}`);
          else toast(r.status === 409 ? 'Someone changed this task. Board refreshed.' : (r.data.error || 'Move failed'), true);
          await reload();
          $(`[data-open="${CSS.escape(rec.id)}"]`, body)?.focus();
        });
      },
    });
    $('[data-add]', host).onclick = t.add;
    $$('[data-v]', host).forEach((b) => b.onclick = () => { view = b.dataset.v; sessionStorage.setItem('mphs-task-view', view); $$('[data-v]', host).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); t.redraw(); });
  },

  async budgets(host) {
    let ev = sessionStorage.getItem('mphs-budget-ev') || 'Reunion';
    host.innerHTML = head('Budgets & tickets', 'Separate event budgets. Blank estimates are unpriced, not zero. Enter 0 only for an agreed no-cost category.', `<div class="seg" role="group" aria-label="Event"><button type="button" data-ev="Reunion" aria-pressed="${ev === 'Reunion'}">Reunion</button><button type="button" data-ev="Cruise" aria-pressed="${ev === 'Cruise'}">Cruise</button></div>${exportBtn('budgetLines')}`) + '<div data-k></div><div data-b></div><div data-tk class="mt-24"></div>';
    let lines = [], settings = [], ledgerNet = null;
    const load = async () => {
      const [l, s, sum] = await Promise.all([req('GET', '/api/c/budgetLines'), req('GET', '/api/c/budgetSettings'), req('GET', '/api/summary')]);
      if (!l.ok || !s.ok) { $('[data-b]', host).innerHTML = '<p class="notice notice-crimson">Could not load budgets.</p>'; return; }
      lines = l.data.records; settings = s.data.records;
      ledgerNet = sum.ok && sum.data[ev].ledger ? sum.data[ev].ledger.receivedByCommittee : null;
      draw();
    };
    const draw = () => {
      const evLines = lines.filter((x) => x.event === ev);
      const set = settings.find((x) => x.id === ev);
      const b = fin.budgetSummary(evLines, set?.reserveRate);
      const gap = ledgerNet === null ? fin.PENDING : fin.fundingGap(b.totalWithReserve, ledgerNet);
      $('[data-k]', host).innerHTML = `<div class="kpis">
        ${kpi('Known estimate subtotal', money(b.knownSubtotal), `${b.pricedCount} of ${b.categories} categories priced`)}
        ${kpi('Unpriced categories', String(b.unpriced), b.unpriced ? 'Total stays Pending' : 'All categories priced', b.unpriced > 0)}
        ${kpi('Reserve', isPend(b.reserveAmount) ? fin.PENDING : money(b.reserveAmount), `${esc(set?.reserveRate ?? '—')} rate · ${esc(set?.reserveStatus || '')}`, isPend(b.reserveAmount))}
        ${kpi('Total incl. reserve', money(b.totalWithReserve), esc(set?.estimateStatus || ''), isPend(b.totalWithReserve))}
        ${kpi('Recorded actuals', money(b.actualSubtotal), `${b.actualRecorded} categories with actuals`)}
        ${kpi('Funding gap', money(gap), ledgerNet === null ? 'Needs finance access and a complete estimate' : 'Total minus net confirmed receipts held by the committee (provider-held fares excluded)', isPend(gap))}
      </div>`;
      $('[data-b]', host).innerHTML = `
        <section class="panel"><header><h2>${ev} budget lines</h2><div class="row-actions"><label class="muted" for="rr">Reserve rate</label><input id="rr" class="cell" inputmode="decimal" value="${esc(set?.reserveRate ?? '')}" aria-describedby="rrHint"><button class="btn btn-sm btn-ghost" data-rr>Save rate</button></div></header>
          <div class="body"><p class="muted" id="rrHint">The 12.5% reserve comes from the source tracker and is not approved policy. Edits save per row when you leave a field.</p></div>
          <div class="tbl-wrap"><table class="tbl"><caption class="sr-only">${ev} budget</caption>
            <thead><tr><th>Category</th><th class="num">Estimate USD</th><th class="num">Actual USD</th><th class="num">Variance</th><th>Owner or quote reference</th><th>Saved</th></tr></thead>
            <tbody>${evLines.map((x) => `<tr data-id="${esc(x.id)}" data-v="${x.version}">
              <th scope="row">${esc(x.category)}<div class="src-ref">${esc(x.source || '')}</div></th>
              <td class="num"><label class="sr-only" for="e-${x.id}">${esc(x.category)} estimate</label><input class="cell" id="e-${x.id}" data-f="estimate" inputmode="decimal" value="${x.estimate ?? ''}" placeholder="Pending"></td>
              <td class="num"><label class="sr-only" for="a-${x.id}">${esc(x.category)} actual</label><input class="cell" id="a-${x.id}" data-f="actual" inputmode="decimal" value="${x.actual ?? ''}" placeholder="—"></td>
              <td class="num">${money(fin.lineVariance(x))}</td>
              <td><label class="sr-only" for="r-${x.id}">${esc(x.category)} reference</label><input class="cell wide" id="r-${x.id}" data-f="ref" value="${esc(x.ref)}" placeholder="Owner or quote ID"></td>
              <td><span class="save-state" data-state>v${x.version}</span></td></tr>`).join('')}</tbody>
            <tfoot><tr><td>Known subtotal</td><td class="num">${money(b.knownSubtotal)}</td><td class="num">${money(b.actualSubtotal)}</td><td></td><td colspan="2">${b.unpriced ? `${b.unpriced} unpriced: total Pending` : `Total incl. reserve ${esc(fin.fmtMoney(b.totalWithReserve))}`}</td></tr></tfoot>
          </table></div></section>`;
      $$('[data-b] input.cell[data-f]', host).forEach((inp) => {
        const orig = inp.value;
        inp.addEventListener('change', async () => {
          const tr = inp.closest('tr');
          const f = inp.dataset.f;
          const st = $('[data-state]', tr);
          let val = inp.value.trim();
          if (f !== 'ref') { const m = fin.parseMoney(val); if (Number.isNaN(m) || (m !== null && m < 0)) { inp.setAttribute('aria-invalid', 'true'); st.className = 'save-state bad'; st.textContent = 'Use an amount like 1250.50, or blank'; return; } val = m; }
          inp.removeAttribute('aria-invalid');
          st.className = 'save-state'; st.textContent = 'Saving…';
          const r = await req('PATCH', `/api/c/budgetLines/${tr.dataset.id}`, { [f]: val, version: Number(tr.dataset.v) });
          if (r.ok) {
            const nextId = document.activeElement?.id;
            const i = lines.findIndex((x) => x.id === tr.dataset.id); lines[i] = r.data.record; draw();
            const st2 = $(`tr[data-id="${tr.dataset.id}"] [data-state]`, host); st2.className = 'save-state ok'; st2.textContent = `Saved v${r.data.record.version}`;
            (nextId && document.getElementById(nextId) ? document.getElementById(nextId) : $(`#${inp.id}`, host))?.focus();
          }
          else if (r.status === 409) { st.className = 'save-state bad'; st.textContent = 'Changed elsewhere: reloaded'; toast(`Someone else saved ${tr.querySelector('th').firstChild.textContent}. Showing their value; re-enter yours if still needed.`, true); inp.value = orig; await load(); }
          else { st.className = 'save-state bad'; st.textContent = Object.values(r.data.errors || {})[0] || r.data.error; inp.setAttribute('aria-invalid', 'true'); }
        });
      });
      $('[data-rr]', host).onclick = async () => {
        const v = $('#rr', host).value.trim();
        const n = v === '' ? null : Number(v);
        if (v !== '' && !(Number.isFinite(n) && n >= 0 && n <= 1)) { toast('Enter the rate as a decimal between 0 and 1, e.g. 0.125, or leave blank for Pending.', true); $('#rr', host).setAttribute('aria-invalid', 'true'); $('#rr', host).focus(); return; }
        $('#rr', host).removeAttribute('aria-invalid');
        const r = await req('PATCH', `/api/c/budgetSettings/${ev}`, { reserveRate: n, version: set.version });
        if (r.ok) { toast('Reserve rate saved. It remains an assumption until approved.'); await load(); } else toast(r.status === 409 ? 'Changed elsewhere; reloaded.' : (Object.values(r.data.errors || {})[0] || r.data.error), true);
        if (r.status === 409) await load();
      };
    };
    $$('[data-ev]', host).forEach((bt) => bt.onclick = () => { ev = bt.dataset.ev; sessionStorage.setItem('mphs-budget-ev', ev); $$('[data-ev]', host).forEach((x) => x.setAttribute('aria-pressed', String(x === bt))); load(); });
    await load();
    $('[data-tk]', host).innerHTML = '<section class="panel"><header><h2>Ticket options (proposals)</h2></header><div class="body"><p class="muted">Projected revenue stays Pending until price and planned quantity are both entered. Platform and payment terms are not approved.</p><div data-tt></div></div></section>';
    await crudTable($('[data-tt]', host), {
      collection: 'tickets', noun: 'Ticket option', titleKey: 'tier',
      columns: [{ key: 'event', label: 'Event' }, { key: 'tier', label: 'Tier' }, { key: 'price', label: 'Price', num: true, render: (r) => money(r.price) }, { key: 'qty', label: 'Planned qty', num: true, render: (r) => orPending(r.qty) },
        { key: 'proj', label: 'Projected revenue', num: true, render: (r) => money(typeof r.price === 'number' && typeof r.qty === 'number' ? r.price * r.qty : null) }, { key: 'status', label: 'Status', render: (r) => pill(r.status) }],
      fields: [{ key: 'event', label: 'Event', type: 'select', options: EV2 }, { key: 'tier', label: 'Tier', type: 'text', required: true }, { key: 'price', label: 'Price USD', type: 'money' }, { key: 'qty', label: 'Planned quantity', type: 'int' }, { key: 'status', label: 'Status', type: 'select', options: ['Proposal', 'Approved', 'Cut'] }, { key: 'terms', label: 'Terms reference', type: 'text' }],
    });
  },

  async sponsors(host) {
    host.innerHTML = head('Sponsors', 'Proposed amounts, commitments and receipts are separate. Only Committed or Paid records count. Sponsor cash is recorded once, in the ledger.', `${exportBtn('sponsors')}${addBtn('New sponsor')}`) + '<div data-k></div><div data-t></div>';
    const statuses = ['Prospect', 'Proposed', 'Committed', 'Paid', 'Declined'];
    const t = await crudTable($('[data-t]', host), {
      collection: 'sponsors', noun: 'Sponsor', titleKey: 'business', search: ['business', 'tier', 'owner'],
      filters: [{ key: 'event', label: 'Event', options: EV2 }, { key: 'status', label: 'Status', options: statuses }],
      emptyTitle: 'No sponsors recorded', emptyText: 'Sponsor tiers are not defined yet. Add prospects as conversations start.',
      onLoad: (recs) => {
        $('[data-k]', host).innerHTML = `<div class="kpis">${EV2.map((ev) => { const s = fin.sponsorSummary(recs, ev); return kpi(`${ev} commitments`, money(s.committed), `Pipeline ${esc(fin.fmtMoney(s.pipelineProposed))} not counted · ${s.declinedCount} declined excluded${s.committedMissingAmount ? ` · ${s.committedMissingAmount} committed without amount` : ''}`); }).join('')}</div>`;
      },
      columns: [{ key: 'business', label: 'Business', render: (r) => `<strong>${esc(r.business)}</strong>${demoPill(r)}` }, { key: 'event', label: 'Event' }, { key: 'tier', label: 'Tier' },
        { key: 'proposed', label: 'Proposed', num: true, render: (r) => money(r.proposed) }, { key: 'committed', label: 'Committed', num: true, render: (r) => money(r.committed) },
        { key: 'status', label: 'Status', render: (r) => pill(r.status) }, { key: 'counted', label: 'Counts?', render: (r) => (fin.SPONSOR_COUNTED.includes(r.status) ? 'Yes' : '<span class="muted">No</span>') },
        { key: 'receiptRef', label: 'Ledger receipt', render: (r) => esc(r.receiptRef) || '<span class="muted">—</span>' }],
      fields: [{ key: 'business', label: 'Business', type: 'text', required: true }, { key: 'event', label: 'Event', type: 'select', options: EV2 }, { key: 'tier', label: 'Tier', type: 'text' },
        { key: 'proposed', label: 'Proposed USD', type: 'money', hint: 'What was discussed. Never counted as funding.' }, { key: 'committed', label: 'Committed USD', type: 'money', hint: 'Agreed amount. Counts only when status is Committed or Paid.' },
        { key: 'status', label: 'Status', type: 'select', options: statuses }, { key: 'benefit', label: 'Benefit or agreement', type: 'text' }, { key: 'owner', label: 'Owner', type: 'text' },
        { key: 'receiptRef', label: 'Ledger transaction ID', type: 'text', hint: 'Cash is recorded in the ledger, not here.' }],
      defaults: () => ({ event: 'Reunion', status: 'Prospect' }),
    });
    $('[data-add]', host).onclick = t.add;
  },

  async vendors(host) {
    host.innerHTML = head('Vendors & quotes', 'Compare real written quotes. Every row states its basis; per-person cost needs occupancy for per-cabin quotes.', `${exportBtn('quotes')}${addBtn('Record a quote')}`) + '<div data-t></div>';
    const t = await crudTable($('[data-t]', host), {
      collection: 'quotes', noun: 'Quote', titleKey: 'vendor', search: ['vendor', 'category', 'ref'],
      filters: [{ key: 'event', label: 'Event', options: EV2 }, { key: 'status', label: 'Status', options: ['Requested', 'Received', 'Shortlisted', 'Selected', 'Rejected'] }],
      emptyTitle: 'No quotes recorded', emptyText: 'Quotes are pending. Record a quote only when you have it in writing, with its date and expiry.',
      sort: (a, b) => (fin.quotePerPerson(a) === fin.PENDING) - (fin.quotePerPerson(b) === fin.PENDING) || (fin.quotePerPerson(a) - fin.quotePerPerson(b)),
      columns: [{ key: 'vendor', label: 'Vendor', render: (r) => `<strong>${esc(r.vendor)}</strong>${demoPill(r)}` }, { key: 'event', label: 'Event' }, { key: 'category', label: 'Category' },
        { key: 'amount', label: 'Quoted', num: true, render: (r) => money(r.amount) }, { key: 'basis', label: 'Basis', render: (r) => `${esc(r.basis)}${r.basis === 'Per cabin' ? ` · ${r.occupancy ?? '?'} sharing` : ''}` },
        { key: 'pp', label: 'Per person', num: true, render: (r) => money(fin.quotePerPerson(r)) },
        { key: 'validUntil', label: 'Valid until', render: (r) => esc(r.validUntil) || '<span class="pend">Unknown</span>' }, { key: 'status', label: 'Status', render: (r) => pill(r.status) }],
      fields: [{ key: 'vendor', label: 'Vendor', type: 'text', required: true }, { key: 'event', label: 'Event', type: 'select', options: EV2 }, { key: 'category', label: 'Category', type: 'text', required: true, hint: 'e.g. Venue, Catering, Group cruise fare' },
        { key: 'amount', label: 'Quoted amount USD', type: 'money' }, { key: 'basis', label: 'Basis', type: 'select', options: ['Total', 'Per person', 'Per cabin'] }, { key: 'occupancy', label: 'Occupancy (people per cabin)', type: 'int' },
        { key: 'quoteDate', label: 'Quote date', type: 'date' }, { key: 'validUntil', label: 'Valid until', type: 'date' }, { key: 'status', label: 'Status', type: 'select', options: ['Requested', 'Received', 'Shortlisted', 'Selected', 'Rejected'] },
        { key: 'ref', label: 'Terms or quote link/reference', type: 'text' }, { key: 'owner', label: 'Owner', type: 'text' }],
      defaults: () => ({ event: 'Reunion', basis: 'Total', status: 'Received' }),
      canDelete: true,
    });
    $('[data-add]', host).onclick = t.add;
  },

  async program(host) {
    host.innerHTML = head('Run of show', 'The proposed reunion program. Reorder segments, assign owners and fill times when the venue is known.', `${exportBtn('program')}${addBtn('Add segment')}`) + '<div data-t></div>';
    const t = await crudTable($('[data-t]', host), {
      collection: 'program', noun: 'Segment', titleKey: 'segment',
      filters: [{ key: 'event', label: 'Event', options: EV2 }],
      sort: (a, b) => a.event.localeCompare(b.event) || (a.seq ?? 999) - (b.seq ?? 999),
      columns: [{ key: 'seq', label: '#', render: (r) => `<strong>${esc(r.seq ?? '—')}</strong>` }, { key: 'segment', label: 'Segment', render: (r) => `<strong>${esc(r.segment)}</strong>` },
        { key: 'start', label: 'Start', render: (r) => orPending(r.start) }, { key: 'duration', label: 'Minutes', num: true, render: (r) => orPending(r.duration) },
        { key: 'owner', label: 'Owner', render: (r) => esc(r.owner) || '<span class="muted">Unassigned</span>' }, { key: 'status', label: 'Status', render: (r) => pill(r.status) }],
      rowExtra: (r) => `<button class="btn btn-sm btn-ghost" data-up="${esc(r.id)}" aria-label="Move ${esc(r.segment)} earlier">↑</button><button class="btn btn-sm btn-ghost" data-down="${esc(r.id)}" aria-label="Move ${esc(r.segment)} later">↓</button>`,
      footer: (list) => { const live = list.filter((x) => x.status !== 'Cut'); const known = live.every((x) => typeof x.duration === 'number'); return `<tr><td colspan="3">Total running time (excluding cut)</td><td class="num">${known ? `${live.reduce((a, x) => a + x.duration, 0)} min` : `<span class="pend">Pending</span>`}</td><td colspan="3">${known ? '' : `${live.filter((x) => typeof x.duration !== 'number').length} segments without duration`}</td></tr>`; },
      wireRow(body, { reload, records }) {
        const swap = async (id, dir) => {
          const rec = records.find((x) => x.id === id);
          const sibs = records.filter((x) => x.event === rec.event).sort((a, b) => (a.seq ?? 999) - (b.seq ?? 999));
          const i = sibs.findIndex((x) => x.id === id), j = i + dir;
          if (j < 0 || j >= sibs.length) return;
          const other = sibs[j];
          const a = await req('PATCH', `/api/c/program/${rec.id}`, { seq: other.seq, version: rec.version });
          const b = a.ok ? await req('PATCH', `/api/c/program/${other.id}`, { seq: rec.seq, version: other.version }) : a;
          if (!a.ok || !b.ok) toast('Order changed elsewhere; reloaded.', true); else toast(`Moved ${rec.segment}`);
          await reload();
          $(`[data-${dir < 0 ? 'up' : 'down'}="${CSS.escape(id)}"]`, body)?.focus();
        };
        $$('[data-up]', body).forEach((b) => b.onclick = () => swap(b.dataset.up, -1));
        $$('[data-down]', body).forEach((b) => b.onclick = () => swap(b.dataset.down, 1));
      },
      fields: [{ key: 'segment', label: 'Segment', type: 'text', required: true }, { key: 'event', label: 'Event', type: 'select', options: EV2 }, { key: 'seq', label: 'Order', type: 'int' },
        { key: 'start', label: 'Start time', type: 'text', hint: 'e.g. 19:30. Leave blank until the venue is confirmed.' }, { key: 'duration', label: 'Duration (minutes)', type: 'int' },
        { key: 'owner', label: 'Owner', type: 'text' }, { key: 'status', label: 'Status', type: 'select', options: ['Proposed', 'Approved', 'Cut'] }, { key: 'notes', label: 'Notes', type: 'textarea', max: 500 }],
      defaults: () => ({ event: 'Reunion', status: 'Proposed' }),
    });
    $('[data-add]', host).onclick = t.add;
  },

  async merch(host) {
    host.innerHTML = head('Merchandise', 'Concept items from the tracker. Margin stays Pending until unit cost and sell price are both known.', `${exportBtn('merch')}${addBtn('Add item')}`) + '<div data-t></div>';
    const t = await crudTable($('[data-t]', host), {
      collection: 'merch', noun: 'Item', titleKey: 'item', search: ['item', 'notes'],
      filters: [{ key: 'status', label: 'Status', options: ['Concept', 'Quoted', 'Approved', 'Ordered', 'Cut'] }],
      columns: [{ key: 'item', label: 'Item', render: (r) => `<strong>${esc(r.item)}</strong>` }, { key: 'event', label: 'Event' }, { key: 'unitCost', label: 'Unit cost', num: true, render: (r) => money(r.unitCost) },
        { key: 'sellPrice', label: 'Sell price', num: true, render: (r) => money(r.sellPrice) }, { key: 'margin', label: 'Margin', num: true, render: (r) => money(fin.merchMargin(r)) },
        { key: 'qty', label: 'Qty', num: true, render: (r) => orPending(r.qty) }, { key: 'status', label: 'Status', render: (r) => pill(r.status) }],
      fields: [{ key: 'item', label: 'Item', type: 'text', required: true }, { key: 'event', label: 'Event', type: 'select', options: EV }, { key: 'unitCost', label: 'Unit cost USD', type: 'money' },
        { key: 'sellPrice', label: 'Sell price USD', type: 'money' }, { key: 'qty', label: 'Quantity', type: 'int' }, { key: 'status', label: 'Status', type: 'select', options: ['Concept', 'Quoted', 'Approved', 'Ordered', 'Cut'] }, { key: 'notes', label: 'Vendor or notes', type: 'text' }],
      defaults: () => ({ event: 'Shared', status: 'Concept' }),
    });
    $('[data-add]', host).onclick = t.add;
  },

  async comms(host) {
    host.innerHTML = head('Communications', 'Organic plan for the existing Facebook Page and Instagram @mph_classof08. Drafting and previewing here never post anything; an organizer posts manually after approval.', `${exportBtn('comms')}${addBtn('New item')}`) + '<div data-t></div>';
    const statuses = ['Proposed', 'Drafting', 'Ready for review', 'Approved', 'Awaiting decisions', 'Posted manually'];
    const t = await crudTable($('[data-t]', host), {
      collection: 'comms', noun: 'Content item', titleKey: 'content', search: ['content', 'draft', 'owner'],
      filters: [{ key: 'channel', label: 'Channel', options: ['Facebook Page', 'Instagram', 'Both', 'Email'] }, { key: 'status', label: 'Status', options: statuses }],
      columns: [{ key: 'id', label: 'ID' }, { key: 'event', label: 'Event' }, { key: 'channel', label: 'Channel' }, { key: 'content', label: 'Content', render: (r) => `<strong>${esc(r.content)}</strong>${r.draft ? `<div class="muted">${esc(r.draft.slice(0, 90))}${r.draft.length > 90 ? '…' : ''}</div>` : ''}` },
        { key: 'status', label: 'Status', render: (r) => pill(r.status) }, { key: 'target', label: 'Target date', render: (r) => esc(r.target) || '<span class="muted">—</span>' }],
      fields: [{ key: 'content', label: 'Content idea', type: 'text', required: true }, { key: 'event', label: 'Event', type: 'select', options: EV }, { key: 'channel', label: 'Channel', type: 'select', options: ['Facebook Page', 'Instagram', 'Both', 'Email'] },
        { key: 'status', label: 'Status', type: 'select', options: statuses }, { key: 'owner', label: 'Owner', type: 'text' }, { key: 'target', label: 'Target date', type: 'date' },
        { key: 'draft', label: 'Draft text', type: 'textarea', max: 5000, hint: 'Only state approved facts. No urgency or scarcity claims.' }, { key: 'link', label: 'Approved link (https)', type: 'url' }, { key: 'notes', label: 'Notes', type: 'text' }],
      defaults: () => ({ event: 'Shared', channel: 'Both', status: 'Drafting' }),
      extra(slot, form) {
        const a = art('mj-1');
        slot.innerHTML = `<h3 class="mt-18">Preview <span class="muted">(local only, not posted)</span></h3><div class="post-preview"><div class="ph"><img src="/art/web/seal-96.png" alt=""><div><strong>MPHS Class of 2008</strong><span>Draft preview</span></div></div><div class="txt" data-pv></div><div class="img"><img src="${a.src}" alt="${esc(a.alt)}"></div></div><p class="charcount" data-cc></p>`;
        const ta = $('[name="draft"]', form);
        const upd = () => { const v = ta.value; $('[data-pv]', slot).textContent = v || 'Your draft will appear here.'; const cc = $('[data-cc]', slot); cc.textContent = `${v.length} characters · Instagram captions allow up to 2,200`; cc.classList.toggle('over', v.length > 2200); };
        ta.addEventListener('input', upd); upd();
      },
    });
    $('[data-add]', host).onclick = t.add;
  },

  async closeout(host) {
    host.innerHTML = head('Closeout', 'Proposed post-event checklist. Each item saves immediately.', exportBtn('closeout')) + '<section class="panel"><div class="body"><ul class="check-list" data-l></ul></div></section>';
    const load = async () => {
      const r = await req('GET', '/api/c/closeout');
      if (!r.ok) return;
      const done = r.data.records.filter((x) => x.done).length;
      $('[data-l]', host).innerHTML = `<li class="muted">${done} of ${r.data.records.length} complete</li>` + r.data.records.map((x) => `<li class="${x.done ? 'done' : ''}"><input type="checkbox" id="x-${x.id}" data-id="${esc(x.id)}" data-v="${x.version}" ${x.done ? 'checked' : ''}><label class="t" for="x-${x.id}">${esc(x.title)}</label></li>`).join('');
      $$('[data-l] input', host).forEach((c) => c.onchange = async () => {
        const r2 = await req('PATCH', `/api/c/closeout/${c.dataset.id}`, { done: c.checked, version: Number(c.dataset.v) });
        if (!r2.ok) toast(r2.status === 409 ? 'Changed elsewhere; reloaded.' : r2.data.error, true); else toast(c.checked ? 'Marked complete' : 'Marked not complete');
        await load(); $(`#x-${c.dataset.id}`, host)?.focus();
      });
    };
    await load();
  },

  async activity(host) {
    const cols = ['decisions', 'tasks', 'budgetLines', 'budgetSettings', 'sponsors', 'quotes', 'program', 'merch', 'comms', 'tickets', 'closeout', 'people', 'participation', 'cabins', 'ledger', 'memories'];
    host.innerHTML = head('Activity log', 'Who changed what, and when. Field names are logged; values are not, so the log never copies private data.') + `<div class="filters"><label for="actC" class="sr-only">Collection</label><select id="actC">${cols.map((c) => `<option>${c}</option>`).join('')}</select></div><section class="panel"><div class="body"><ul class="history" data-h></ul></div></section>`;
    const load = async () => {
      const c = $('#actC', host).value;
      const r = await req('GET', `/api/history/${c}`);
      $('[data-h]', host).innerHTML = !r.ok ? `<li class="muted">${esc(r.data.error)}</li>` : r.data.history.length ? r.data.history.map((h) => `<li><strong>${esc(h.action)} ${esc(h.id)}</strong> by ${esc(h.userId)} <span class="muted">${esc(new Date(h.at).toLocaleString())}${h.fields.length ? ` · ${esc(h.fields.join(', '))}` : ''}</span></li>`).join('') : '<li class="muted">No changes recorded yet. Seeded records start at version 1.</li>';
    };
    $('#actC', host).onchange = load;
    await load();
  },

  async crm(host) {
    host.innerHTML = head('Classmate records', `Restricted. Stable Alumni IDs with separate participation per event. <strong>All records here are fictional demo data.</strong> The real 318-name roster stays outside this project until shared access, storage and an import are approved.`, `${exportBtn('people')}${has('crm.contact') ? addBtn('Add person') : ''}`) +
      `<p class="notice notice-crimson">No public roster search exists. Contact fields are visible only with the <code>crm.contact</code> permission; agreed totals only with <code>crm.finance</code>. ${has('crm.contact') ? 'You have contact access.' : 'Contact fields are redacted for your account by the server.'}</p><div data-p></div><h2 class="mt-24">Event participation</h2><div data-pt></div>`;
    const t = await crudTable($('[data-p]', host), {
      collection: 'people', keyField: 'alumniId', noun: 'Person', titleKey: 'alumniId', search: ['alumniId', 'firstName', 'lastName'], searchLabel: 'Search by name or Alumni ID…',
      canEdit: has('crm.contact'),
      columns: [{ key: 'alumniId', label: 'Alumni ID', render: (r) => `<code>${esc(r.alumniId)}</code>` }, { key: 'name', label: 'Name (as in source)', render: (r) => `${esc(r.firstName)} ${esc(r.lastName)}${demoPill(r)}` },
        { key: 'gradYear', label: 'Class' }, { key: 'email', label: 'Email', render: (r) => restricted(r.email) || esc(r.email) || '<span class="muted">—</span>' },
        { key: 'contactPermission', label: 'Contact permission', render: (r) => restricted(r.contactPermission) || esc(r.contactPermission) }, { key: 'optOut', label: 'Opted out', render: (r) => restricted(r.optOut) || (r.optOut ? '<strong>Yes</strong>' : 'No') },
        { key: 'provenance', label: 'Provenance', render: (r) => `<span class="muted">${esc(r.provenance)}</span>` }],
      fields: [{ key: 'alumniId', label: 'Alumni ID', type: 'text', hint: 'Stable identifier. Leave blank to generate.', readonly: false }, { key: 'firstName', label: 'First name (as in source)', type: 'text', required: true }, { key: 'lastName', label: 'Last name (as in source)', type: 'text', required: true },
        { key: 'gradYear', label: 'Class year', type: 'int' }, { key: 'email', label: 'Email', type: 'text' }, { key: 'phone', label: 'Phone', type: 'text' },
        { key: 'contactPermission', label: 'Contact permission', type: 'select', options: ['Not recorded', 'Email OK', 'Phone OK', 'Do not contact'] }, { key: 'optOut', label: 'Opted out of all contact', type: 'bool' },
        { key: 'provenance', label: 'Where this record came from', type: 'text' }, { key: 'corrections', label: 'Proposed corrections (log; do not overwrite source spelling)', type: 'text' }],
      defaults: () => ({ gradYear: 2008, contactPermission: 'Not recorded', optOut: false, provenance: 'Fictional demo fixture', demo: true }),
    });
    const a = $('[data-add]', host); if (a) a.onclick = t.add;
    if (has('crm.contact')) {
      const imp = document.createElement('section');
      imp.className = 'panel mt-24';
      imp.innerHTML = `<header><h2>Import classmate records (review first)</h2><span class="pill pill-restricted">Contact permission</span></header>
        <div class="body">
          <p class="notice notice-warn">Local demo: use fictional files only, such as <code>samples/fictional-roster-318.csv</code>. Importing the real roster is a separate approval. Existing Alumni IDs are never overwritten; record corrections in the corrections log.</p>
          <div class="grid-2">
            <div class="field"><label for="impFile">CSV file</label><input type="file" id="impFile" accept=".csv,.txt,text/csv"><span class="hint">Comma, semicolon or tab separated. Recognised columns include Alumni ID, First Name, Middle Name, Last Name, Graduation Year, Email, Phone, Contact Permission. You decide what happens to any other column.</span></div>
            <div class="field"><label for="impLabel">Source label (provenance)</label><input id="impLabel" placeholder="e.g. Fictional test file v1"></div>
            <div class="field"><label for="impExpected">Expected number of rows (optional)</label><input id="impExpected" inputmode="numeric" autocomplete="off" placeholder="e.g. 318"><span class="hint">If set, the import is blocked unless the file has exactly this many rows.</span></div>
          </div>
          <div class="field"><label for="impCsv">Or paste CSV</label><textarea id="impCsv" spellcheck="false"></textarea><span class="err" data-err="csv" hidden></span></div>
          <button type="button" class="btn btn-sm" id="impPreview">Preview import</button>
          <div id="impOut" class="mt-18" aria-live="polite"></div>
        </div>`;
      $('[data-p]', host).after(imp);
      const err = $('[data-err="csv"]', imp);
      const TARGET_LABELS = { alumniId: 'Alumni ID', firstName: 'First name', middleName: 'Middle name (kept in the corrections log)', lastName: 'Last name', gradYear: 'Class year', email: 'Email', phone: 'Phone', contactPermission: 'Contact permission', optOut: 'Opt out', provenance: 'Source / provenance', note: 'Keep as a note on the person', ignore: 'Ignore (not imported)' };
      let choices = Object.create(null); // a column may be named anything, even "__proto__"
      $('#impFile', imp).onchange = async (e) => { const f = e.target.files[0]; if (f) { if (f.size > 190000) { err.hidden = false; err.textContent = 'File too large for one import (max about 190 KB).'; return; } $('#impCsv', imp).value = await f.text(); choices = Object.create(null); } };
      $('#impCsv', imp).oninput = () => { choices = Object.create(null); };
      const payload = () => ({ csv: $('#impCsv', imp).value, sourceLabel: $('#impLabel', imp).value || 'CSV import', mapping: choices, expectedCount: $('#impExpected', imp).value.trim() || null });
      const preview = async () => {
        err.hidden = true;
        const r = await req('POST', '/api/import/people/preview', payload());
        const out = $('#impOut', imp);
        if (!r.ok) { err.hidden = false; err.textContent = (r.data.errors && Object.values(r.data.errors)[0]) || r.data.error; out.innerHTML = ''; return; }
        const p = r.data;
        const colRow = (c) => `<tr><td>${esc(c.header)}</td><td>${c.auto ? esc(TARGET_LABELS[c.auto]) : '<span class="pend">Not recognised</span>'}</td><td><select data-col="${esc(c.header)}" aria-label="What to do with the column ${esc(c.header)}">${c.target ? '' : '<option value="" selected>Choose…</option>'}${Object.entries(TARGET_LABELS).map(([v, l]) => `<option value="${v}"${c.target === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></td></tr>`;
        out.innerHTML = `<div class="kpis">${kpi('Rows', String(p.summary.total))}${kpi('To add', String(p.summary.toAdd))}${kpi('Already exist (skipped)', String(p.summary.existing))}${kpi('Rows with errors', String(p.summary.invalid), '', p.summary.invalid > 0)}${kpi('Rows to double-check', String(p.summary.warnings))}</div>
          <p class="muted">Read as ${esc(p.delimiter)}-separated.</p>
          ${p.countProblem ? `<p class="notice notice-crimson">${esc(p.countProblem)}. Check that the whole list was exported.</p>` : ''}
          ${p.missingColumns.length ? `<p class="notice notice-crimson">Missing required columns: ${esc(p.missingColumns.map((f) => TARGET_LABELS[f]).join(', '))}</p>` : ''}
          ${p.undecided.length ? `<p class="notice notice-warn">Choose what to do with: ${esc(p.undecided.join(', '))}. Nothing is dropped without a decision.</p>` : ''}
          ${p.duplicateTargets.length ? `<p class="notice notice-crimson">Two columns are set to the same field: ${esc(p.duplicateTargets.map((f) => TARGET_LABELS[f]).join(', '))}</p>` : ''}
          ${p.duplicatesInFile.length ? `<p class="notice notice-crimson">Duplicate Alumni IDs in file: ${p.duplicatesInFile.map((d) => `${esc(d.alumniId)} (rows ${d.lines.join(', ')})`).join('; ')}</p>` : ''}
          ${p.possibleDuplicates.length ? `<p class="notice">Same name under different Alumni IDs (could be one person twice, or two people): ${p.possibleDuplicates.map((d) => `${esc(d.name)} — ${d.entries.map((e) => `${esc(e.alumniId)}${e.line ? ` (row ${e.line})` : ' (already saved)'}`).join(', ')}${d.count > d.entries.length ? ` and ${d.count - d.entries.length} more` : ''}`).join('; ')}. Not blocked; check before applying.</p>` : ''}
          <details class="mt-18"${p.undecided.length || p.columns.some((c) => !c.auto) ? ' open' : ''}><summary>Columns (${p.columns.length})</summary>
            <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Column in the file</th><th>Recognised as</th><th>What to do</th></tr></thead><tbody>${p.columns.map(colRow).join('')}</tbody></table></div>
          </details>
          <div class="tbl-wrap mt-18"><table class="tbl"><thead><tr><th>Row</th><th>Alumni ID</th><th>Name as in file</th><th>Class</th><th>Result</th></tr></thead><tbody>
          ${p.rows.slice(0, 100).map((x) => `<tr><td>${x.line}</td><td><code>${esc(x.record.alumniId || '')}</code></td><td>${esc(x.record.firstName || '')} ${esc(x.middleName)} ${esc(x.record.lastName || '')}</td><td>${esc(x.record.gradYear ?? '')}</td><td>${Object.keys(x.errors).length ? `<span class="pend">${esc(Object.entries(x.errors).map(([k, v]) => `${TARGET_LABELS[k] || k}: ${v}`).join('; '))}</span>` : x.existing ? '<span class="muted">Exists, skipped</span>' : 'Will add'}${x.warnings.length ? `<div class="muted">Check: ${esc(x.warnings.join('; '))}</div>` : ''}</td></tr>`).join('')}
          </tbody></table></div>${p.rows.length > 100 ? `<p class="muted">Showing the first 100 of ${p.rows.length} rows. Errors and checks are counted for all rows above.</p>` : ''}
          ${p.canApply && p.summary.toAdd ? `<label class="check mt-18"><input type="checkbox" id="impConfirm"> <span>This file is fictional test data, or importing it has been approved.</span></label><button type="button" class="btn btn-sm btn-crimson mt-8" id="impApply">Apply import (${p.summary.toAdd} new)</button>` : `<p class="muted mt-18">${p.canApply ? 'Nothing new to add.' : 'Fix the reported issues and preview again.'}</p>`}`;
        $$('[data-col]', out).forEach((sel) => sel.addEventListener('change', () => { if (sel.value) { choices[sel.dataset.col] = sel.value; preview(); } }));
        const ap = $('#impApply', imp);
        if (ap) ap.onclick = async () => {
          const r2 = await req('POST', '/api/import/people/apply', { ...payload(), confirm: $('#impConfirm', imp).checked });
          if (r2.ok) { toast(`Imported ${r2.data.added}; skipped ${r2.data.skippedExisting} existing`); out.innerHTML = ''; $('#impCsv', imp).value = ''; choices = Object.create(null); t.reload(); }
          else toast((r2.data.errors && Object.values(r2.data.errors)[0]) || r2.data.error, true);
        };
      };
      $('#impPreview', imp).onclick = preview;
    }
    await crudTable($('[data-pt]', host), {
      collection: 'participation', noun: 'Participation', titleKey: 'alumniId', search: ['alumniId', 'cabinId'],
      filters: [{ key: 'event', label: 'Event', options: EV2 }, { key: 'status', label: 'Status', options: ['Invited', 'Interested', 'Not interested', 'RSVP yes', 'Declined', 'Booked', 'Cancelled'] }],
      columns: [{ key: 'alumniId', label: 'Alumni ID', render: (r) => `<code>${esc(r.alumniId)}</code>${demoPill(r)}` }, { key: 'event', label: 'Event' }, { key: 'status', label: 'Status', render: (r) => pill(r.status) },
        { key: 'agreedTotal', label: 'Agreed total', num: true, render: (r) => restricted(r.agreedTotal) || money(r.agreedTotal) }, { key: 'guests', label: 'Guests', num: true }, { key: 'cabinId', label: 'Cabin ID', render: (r) => esc(r.cabinId) || '<span class="muted">—</span>' }],
      fields: [{ key: 'alumniId', label: 'Alumni ID', type: 'text', required: true }, { key: 'event', label: 'Event', type: 'select', options: EV2 },
        { key: 'status', label: 'Status', type: 'select', options: ['Invited', 'Interested', 'Not interested', 'RSVP yes', 'Declined', 'Booked', 'Cancelled'], hint: 'RSVP and interest are not payments.' },
        { key: 'agreedTotal', label: 'Agreed total USD', type: 'money', hint: 'Blank means Pending: balance cannot be computed.' }, { key: 'guests', label: 'Guests', type: 'int' }, { key: 'cabinId', label: 'Cabin ID (cruise)', type: 'text' }],
      defaults: () => ({ event: 'Reunion', status: 'Interested', guests: 0, demo: true }),
    });
  },

  async cabins(host) {
    host.innerHTML = head('Cabins', 'One booked cabin per unique Cabin ID after provider confirmation. Two travellers sharing a cabin are one cabin. Duplicate IDs are flagged, never guessed.', `${exportBtn('cabins')}${addBtn('Add cabin')}`) + '<div data-k></div><div data-t></div><h2 class="mt-24">Traveller assignments</h2><p class="muted">Booked cruise participation records and the Cabin ID each traveller is assigned to.</p><div data-a></div>';
    let parts = [];
    const pr = await req('GET', '/api/c/participation');
    if (pr.ok) parts = pr.data.records.filter((p) => p.event === 'Cruise' && p.status === 'Booked');
    const t = await crudTable($('[data-t]', host), {
      collection: 'cabins', noun: 'Cabin', titleKey: 'cabinId',
      emptyTitle: 'No cabins recorded', emptyText: 'Record a cabin when a provider issues a Cabin ID.',
      onLoad: (cabs) => {
        const s = fin.cabinSummary(cabs, parts);
        $('[data-k]', host).innerHTML = `<div class="kpis">${kpi('Booked cabins', String(s.bookedCabins), 'Unique, provider-confirmed')}${kpi('Travellers in booked cabins', String(s.travelersInBookedCabins))}${kpi('Awaiting provider', String(s.unconfirmedCabins))}${kpi('Flags', String(s.duplicates.length + s.overCapacity.length + s.unknownCabinRefs.length), [...s.duplicates.map((d) => `Duplicate ${esc(d.cabinId)} ×${d.count}`), ...s.overCapacity.map((o) => `${esc(o.cabinId)} over capacity (${o.travelers}/${o.capacity})`), ...s.unknownCabinRefs.map((u2) => `Unknown cabin ${esc(u2)}`)].join(' · ') || 'None', (s.duplicates.length + s.overCapacity.length + s.unknownCabinRefs.length) > 0)}</div>`;
      },
      columns: [{ key: 'cabinId', label: 'Cabin ID', render: (r) => `<code>${esc(r.cabinId)}</code>${demoPill(r)}` }, { key: 'capacity', label: 'Capacity', num: true, render: (r) => orPending(r.capacity) },
        { key: 'occ', label: 'Assigned', num: true, render: (r) => String(parts.filter((p) => p.cabinId === r.cabinId).length) },
        { key: 'providerConfirmed', label: 'Provider confirmed', render: (r) => (r.providerConfirmed ? pill('Confirmed') : pill('Pending', 'Awaiting provider')) }, { key: 'providerRef', label: 'Provider ref', render: (r) => esc(r.providerRef) || '<span class="muted">—</span>' }],
      fields: [{ key: 'cabinId', label: 'Cabin ID', type: 'text', required: true }, { key: 'capacity', label: 'Capacity', type: 'int' }, { key: 'providerConfirmed', label: 'Confirmed by provider', type: 'bool' }, { key: 'providerRef', label: 'Provider reference', type: 'text' }, { key: 'notes', label: 'Notes', type: 'text' }],
      defaults: () => ({ capacity: 2, providerConfirmed: false, demo: true }),
    });
    $('[data-add]', host).onclick = t.add;
    $('[data-a]', host).innerHTML = parts.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Alumni ID</th><th>Status</th><th>Cabin ID</th></tr></thead><tbody>${parts.map((p) => `<tr><td><code>${esc(p.alumniId)}</code>${demoPill(p)}</td><td>${pill(p.status)}</td><td>${esc(p.cabinId) || '<span class="pend">Unassigned</span>'}</td></tr>`).join('')}</tbody></table></div><p class="muted">Edit assignments in Classmate records → Event participation.</p>` : '<div class="panel"><div class="empty"><h3>No booked travellers</h3></div></div>';
  },

  async ledger(host) {
    host.innerHTML = head('Ledger & balances', 'The single record of payments and refunds. Only Confirmed transactions count; confirmed refunds subtract. Duplicate IDs are rejected (case-insensitive). Confirmed records are locked: correct them by voiding with a reason and recording a new transaction.', `${exportBtn('ledger')}${addBtn('Record transaction')}`) + '<div data-k></div><div data-t></div><h2 class="mt-24">Balances by person and event</h2><div data-bal></div>';
    const t = await crudTable($('[data-t]', host), {
      collection: 'ledger', noun: 'Transaction', titleKey: 'txnId', search: ['txnId', 'providerRef', 'alumniId'],
      filters: [{ key: 'event', label: 'Event', options: EV2 }, { key: 'status', label: 'Status', options: ['Pending', 'Confirmed', 'Failed', 'Void'] }, { key: 'type', label: 'Type', options: ['Payment', 'Refund'] }],
      sort: (a, b) => a.txnId.localeCompare(b.txnId),
      onLoad: (recs) => {
        $('[data-k]', host).innerHTML = `<div class="kpis">${EV2.map((ev) => { const s = fin.ledgerSummary(recs, { event: ev }); return kpi(`${ev} net confirmed receipts`, money(s.netReceipts), `Payments ${esc(fin.fmtMoney(s.confirmedPayments))} − refunds ${esc(fin.fmtMoney(s.confirmedRefunds))} · pending ${esc(fin.fmtMoney(s.pendingNet))} not counted · provider ${esc(fin.fmtMoney(s.receivedByProvider))} / committee ${esc(fin.fmtMoney(s.receivedByCommittee))}${s.heldForReview ? ` · ${s.heldForReview} held for review` : ''}`); }).join('')}${kpi('Committee bank balance', '<span class="pend">Not tracked here</span>', 'Receipts are not the bank balance. Reconcile against statements.', true)}</div>`;
      },
      columns: [{ key: 'txnId', label: 'Txn ID', render: (r) => `<code>${esc(r.txnId)}</code>${demoPill(r)}` }, { key: 'providerRef', label: 'Provider ref', render: (r) => esc(r.providerRef) || '<span class="muted">—</span>' },
        { key: 'alumniId', label: 'Alumni ID' }, { key: 'event', label: 'Event' }, { key: 'type', label: 'Type', render: (r) => (r.type === 'Refund' ? '<strong>Refund</strong>' : 'Payment') }, { key: 'kind', label: 'Kind' },
        { key: 'amount', label: 'Amount', num: true, render: (r) => (r.type === 'Refund' ? `−${money(r.amount)}` : money(r.amount)) }, { key: 'status', label: 'Status', render: (r) => pill(r.status) }, { key: 'receivedBy', label: 'Received by' }, { key: 'date', label: 'Date' }],
      fields: [{ key: 'txnId', label: 'Transaction ID', type: 'text', required: true, hint: 'Must be unique.' }, { key: 'providerRef', label: 'Provider reference', type: 'text', hint: 'Must be unique when present.' },
        { key: 'alumniId', label: 'Alumni ID', type: 'text' }, { key: 'event', label: 'Event', type: 'select', options: EV2 }, { key: 'type', label: 'Type', type: 'select', options: ['Payment', 'Refund'] },
        { key: 'kind', label: 'Kind', type: 'select', options: ['Ticket', 'Deposit', 'Balance', 'Sponsorship', 'Merch', 'Other'] }, { key: 'amount', label: 'Amount USD (positive)', type: 'money', hint: 'Enter refunds as a positive amount with type Refund.' },
        { key: 'status', label: 'Status', type: 'select', options: ['Pending', 'Confirmed', 'Failed', 'Void'] }, { key: 'receivedBy', label: 'Received by', type: 'select', options: ['Committee', 'Provider'] }, { key: 'date', label: 'Date', type: 'date' }, { key: 'note', label: 'Note (required to void)', type: 'text' }],
      defaults: () => ({ event: 'Reunion', type: 'Payment', kind: 'Ticket', status: 'Pending', receivedBy: 'Committee', demo: true }),
      onSaved: () => loadBal(),
    });
    $('[data-add]', host).onclick = t.add;
    async function loadBal() {
      const r = await req('GET', '/api/balances');
      $('[data-bal]', host).innerHTML = !r.ok ? `<p class="notice">${esc(r.data.error)}</p>` : `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Alumni ID</th><th>Event</th><th>Status</th><th class="num">Agreed total</th><th class="num">Net confirmed</th><th class="num">Balance</th><th>Standing</th><th>Deposit record</th></tr></thead><tbody>${r.data.rows.map((x) => `<tr><td><code>${esc(x.alumniId)}</code></td><td>${esc(x.event)}</td><td>${pill(x.participation)}</td><td class="num">${money(x.agreedTotal)}</td><td class="num">${money(x.net)}</td><td class="num">${money(x.balance)}</td><td>${x.balance === fin.PENDING ? pill('Pending', x.standing) : esc(x.standing)}${x.heldForReview ? ` · ${x.heldForReview} held for review` : ''}</td><td class="muted">${esc(x.depositRecord)}</td></tr>`).join('')}</tbody></table></div>`;
    }
    await loadBal();
  },

  async memories(host) {
    host.innerHTML = head('Memory review', 'Nothing is published by default. Approve only submissions with recorded permission, note the approved use, and honour withdrawals.', exportBtn('memories')) + '<div data-t></div>';
    await crudTable($('[data-t]', host), {
      collection: 'memories', noun: 'Submission', titleKey: 'title',
      filters: [{ key: 'status', label: 'Status', options: ['Submitted', 'Approved', 'Rejected', 'Withdrawn'] }],
      emptyTitle: 'No submissions', emptyText: 'Classmate submissions will appear here for review.',
      columns: [{ key: 'photo', label: 'Photo', render: (r) => memoryPhoto(r) || '<span class="muted">—</span>' }, { key: 'title', label: 'Title', render: (r) => `<strong>${esc(r.title)}</strong>${demoPill(r)}<div class="muted">${esc((r.story || '').slice(0, 120))}</div>` }, { key: 'permission', label: 'Permission', render: (r) => (r.permission ? 'Recorded' : '<span class="pend">Missing</span>') },
        { key: 'status', label: 'Status', render: (r) => pill(r.status) + (r.status === 'Approved' && r.showInGallery ? ' <span class="pill pill-muted">In gallery</span>' : '') }, { key: 'approvedUse', label: 'Approved use', render: (r) => esc(r.approvedUse) || '<span class="muted">—</span>' }],
      fields: [{ key: 'status', label: 'Review status', type: 'select', options: ['Submitted', 'Approved', 'Rejected', 'Withdrawn'], hint: 'A withdrawn submission must not be re-approved. Rejecting or withdrawing deletes its photo for good.' }, { key: 'showInGallery', label: 'Show in the members’ gallery', type: 'bool', hint: 'Only when Approved. Every signed-in member can then see the story and photo. Leave off for uses like “slideshow only”.' }, { key: 'approvedUse', label: 'Approved use', type: 'text', hint: 'e.g. Reunion slideshow only' }, { key: 'moderatorNote', label: 'Moderator note', type: 'text' }],
    });
  },

  async access(host) {
    host.innerHTML = head('Access', 'Invite members by the email they sign in with. Roles and permissions are enforced by the server on every request, and changes are logged. In this local demo, accounts are fictional.') + `
      <section class="panel"><header><h2>Add a member</h2></header><div class="body">
        <form id="addMember" class="grid-2" novalidate>
          <div class="field"><label for="amEmail">Email (must match their sign-in)</label><input id="amEmail" name="email" type="email" autocomplete="off"><span class="err" data-err="email" hidden></span></div>
          <div class="field"><label for="amName">Display name</label><input id="amName" name="displayName" autocomplete="off"><span class="err" data-err="displayName" hidden></span></div>
          <div class="field"><label for="amRole">Role</label><select id="amRole" name="role"><option>organizer</option><option>classmate</option><option>admin</option></select></div>
          <div class="field"><label for="amAlumni">Alumni ID (classmates, optional)</label><input id="amAlumni" name="alumniId" autocomplete="off"><span class="err" data-err="alumniId" hidden></span></div>
          <div><button class="btn btn-sm" type="submit">Add member</button></div>
        </form>
        <p class="muted" id="amNote"></p>
      </div></section>
      <div id="linkPanel" aria-live="polite"></div>
      <div data-u><p class="muted">Loading…</p></div>`;
    const showLink = (who, r) => {
      const url = `${location.origin}/${r.path.replace(/^\//, '')}`;
      $('#linkPanel', host).innerHTML = `<section class="panel"><header><h2>${r.purpose === 'reset' ? 'Password reset link' : 'Invite link'} for ${esc(who)}</h2><button type="button" class="btn btn-sm btn-ghost" data-close-link>Done</button></header><div class="body">
        <p>Send this link to ${esc(who)} yourself (text, email or in person). It works <strong>once</strong> and expires ${esc(new Date(r.expiresAt).toLocaleString())}. It is shown only now; create a new one if it is lost. Creating a new link cancels the previous one.</p>
        <div class="field"><label for="inviteUrl">Link</label><input id="inviteUrl" readonly value="${esc(url)}"></div>
        <button type="button" class="btn btn-sm" data-copy-link>Copy link</button></div></section>`;
      $('[data-copy-link]', host).onclick = async () => { try { await navigator.clipboard.writeText(url); toast('Link copied. Nothing was sent.'); } catch { $('#inviteUrl', host).select(); toast('Select the link and copy it manually.', true); } };
      $('[data-close-link]', host).onclick = () => { $('#linkPanel', host).innerHTML = ''; };
      $('#inviteUrl', host).focus(); $('#inviteUrl', host).select();
    };
    const makeLink = async (id, who) => {
      const r = await req('POST', `/api/users/${encodeURIComponent(id)}/invite`, {});
      if (r.ok) { showLink(who, r.data); await load(); } else toast((r.data.errors && Object.values(r.data.errors)[0]) || r.data.error, true);
    };
    const form = $('#addMember', host);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      $$('[data-err]', form).forEach((x) => { x.hidden = true; });
      const body = { email: form.email.value, displayName: form.displayName.value, role: form.role.value, ...(form.alumniId.value ? { alumniId: form.alumniId.value } : {}) };
      const r = await req('POST', '/api/users', body);
      if (r.ok) { form.reset(); toast(`Added ${r.data.user.email}.`); if (!oidcOn) await makeLink(r.data.user.id, r.data.user.displayName); else await load(); return; }
      for (const [k, v] of Object.entries(r.data.errors || {})) { const el = $(`[data-err="${k}"]`, form); if (el) { el.hidden = false; el.textContent = v; } }
      if (!r.data.errors) toast(r.data.error, true);
    });
    let oidcOn = false;
    const load = async () => {
      const r = await req('GET', '/api/users');
      if (!r.ok) { $('[data-u]', host).innerHTML = `<p class="notice">${esc(r.data.error)}</p>`; return; }
      const { users, allPermissions, oidc } = r.data;
      oidcOn = oidc;
      $('#amNote', host).textContent = oidc
        ? 'The app does not send email. After adding someone, tell them to sign in with that address; if your provider requires it, also invite them there.'
        : 'Adding a member creates a one-time invite link for them to set their own password. The app does not send email: you pass the link on.';
      const status = (x) => x.invite ? `${x.invite.purpose === 'reset' ? 'Reset link' : 'Invite link'} open until ${new Date(x.invite.expiresAt).toLocaleDateString()}` : x.passwordSet ? 'Password set' : oidc ? 'Signs in with provider' : 'No password yet';
      $('[data-u]', host).innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Member</th><th>Role</th><th>Extra permissions</th><th>Effective</th><th>Active</th><th></th></tr></thead><tbody>${users.map((x) => `
        <tr data-id="${esc(x.id)}"><td><strong>${esc(x.displayName)}</strong><div class="muted">${esc(x.email || x.username)}${x.demo ? ' · Demo' : ''}</div><div class="muted">${esc(status(x))}</div>${oidc ? '' : `<button type="button" class="linkbtn" data-link="${esc(x.id)}" data-who="${esc(x.displayName)}">${x.passwordSet ? 'Create reset link' : 'Create invite link'}</button>`}</td>
        <td><label class="sr-only" for="role-${x.id}">Role</label><select id="role-${x.id}" data-role>${['classmate', 'organizer', 'admin'].map((ro) => `<option ${ro === x.role ? 'selected' : ''}>${ro}</option>`).join('')}</select></td>
        <td><div class="perm-grid">${allPermissions.filter((p) => p !== 'self').map((p) => `<label><input type="checkbox" data-perm="${p}" ${x.extraPermissions.includes(p) ? 'checked' : ''}> ${p}</label>`).join('')}</div></td>
        <td class="muted">${esc(x.permissions.join(', '))}</td>
        <td><input type="checkbox" data-active ${x.active ? 'checked' : ''} aria-label="Active"></td>
        <td><button class="btn btn-sm" data-save>Save</button><span class="save-state" data-st></span></td></tr>`).join('')}</tbody></table></div>`;
      $$('[data-link]', host).forEach((b) => b.onclick = () => makeLink(b.dataset.link, b.dataset.who));
      $$('[data-save]', host).forEach((b) => b.onclick = async () => {
        const tr = b.closest('tr');
        const body = { role: $('[data-role]', tr).value, extraPermissions: $$('[data-perm]', tr).filter((c) => c.checked).map((c) => c.dataset.perm), active: $('[data-active]', tr).checked };
        const r2 = await req('PATCH', `/api/users/${tr.dataset.id}`, body);
        const st = $('[data-st]', tr);
        if (r2.ok) { toast('Access updated'); await load(); } else { st.className = 'save-state bad'; st.textContent = ` ${Object.values(r2.data.errors || {})[0] || r2.data.error}`; }
      });
    };
    await load();
  },
};

export { openEditor };
