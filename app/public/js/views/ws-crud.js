import { $, $$, esc, toast, demoPill } from '../ui.js';
import { req } from '../api.js';
import { parseMoney } from '/shared/finance.js';

const RESTRICTED = '[restricted]';

export function fieldValue(f, el) {
  if (f.type === 'bool') return el.checked;
  const v = el.value;
  if (f.type === 'money') { const m = parseMoney(v); return Number.isNaN(m) ? v : m; }
  if (f.type === 'int') return v === '' ? null : (Number.isInteger(Number(v)) ? Number(v) : v);
  if (f.type === 'rate') return v === '' ? null : Number(v);
  return v;
}

function inputHtml(f, value) {
  const id = `f-${f.key}`;
  const v = value === null || value === undefined ? '' : value;
  const restricted = v === RESTRICTED;
  const dis = restricted || f.readonly ? 'disabled' : '';
  let ctl;
  if (f.type === 'select') ctl = `<select id="${id}" name="${f.key}" ${dis}>${f.options.map((o) => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  else if (f.type === 'textarea') ctl = `<textarea id="${id}" name="${f.key}" ${dis} maxlength="${f.max || 5000}">${esc(v)}</textarea>`;
  else if (f.type === 'bool') return `<div class="field"><label class="check"><input type="checkbox" id="${id}" name="${f.key}" ${v ? 'checked' : ''} ${dis}> <span>${esc(f.label)}</span></label>${f.hint ? `<span class="hint">${esc(f.hint)}</span>` : ''}<span class="err" data-err="${f.key}" hidden></span></div>`;
  else {
    const type = f.type === 'date' ? 'date' : f.type === 'url' ? 'url' : 'text';
    const mode = f.type === 'money' || f.type === 'rate' ? 'decimal' : f.type === 'int' ? 'numeric' : 'text';
    ctl = `<input id="${id}" name="${f.key}" type="${type}" inputmode="${mode}" value="${esc(restricted ? '' : v)}" ${restricted ? `placeholder="Restricted"` : ''} ${dis} autocomplete="off">`;
  }
  const hint = restricted ? 'You do not have permission to view this field.' : f.hint || (f.type === 'money' ? 'USD. Leave blank for Pending. Enter 0 only for an agreed no-cost item.' : '');
  return `<div class="field ${f.span ? '' : ''}"><label for="${id}">${esc(f.label)}${f.required ? ' *' : ''}</label>${ctl}${hint ? `<span class="hint">${esc(hint)}</span>` : ''}<span class="err" data-err="${f.key}" hidden></span></div>`;
}

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null) || ((a === '' || a === null || a === undefined) && (b === '' || b === null || b === undefined));

// Drawer editor. Saves only changed fields with the record version; shows conflicts instead of overwriting.
export function openEditor({ collection, title, fields, record, isNew, keyField = 'id', onSaved, extra, canEdit = true, canDelete = false }) {
  let original = record ? { ...record } : {};
  const back = document.createElement('div'); back.className = 'drawer-back';
  const d = document.createElement('div'); d.className = 'drawer'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-labelledby', 'drawerH');
  const opener = document.activeElement;
  const close = () => { back.remove(); d.remove(); document.removeEventListener('keydown', onKey); opener?.focus?.(); };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'Tab') {
      const f = $$('button, input, select, textarea, a[href]', d).filter((x) => !x.disabled && x.offsetParent !== null);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  };
  const render = (values) => {
    d.innerHTML = `
      <header>
        <div><h2 id="drawerH">${esc(title)}</h2><div class="muted">${isNew ? 'New record' : `${esc(original[keyField])} · version ${esc(original.version)}${original.source ? ` · <span class="src-ref">${esc(original.source)}</span>` : ''}`}${demoPill(original)}</div></div>
        <button type="button" class="close" aria-label="Close editor">✕</button>
      </header>
      <form class="body" novalidate>
        <div class="conflict-slot"></div>
        ${!canEdit ? '<p class="notice">Read-only for your account.</p>' : ''}
        <fieldset class="plain" ${canEdit ? '' : 'disabled'}>
          ${fields.map((f) => inputHtml(f, values[f.key])).join('')}
        </fieldset>
        <div class="extra-slot"></div>
        ${isNew ? '' : '<details class="mt-18"><summary>Change history</summary><ul class="history" id="histList"><li class="muted">Loading…</li></ul></details>'}
      </form>
      <footer>
        <span class="save-state" aria-live="polite">${isNew ? 'Not saved yet' : `Saved · version ${esc(original.version)}`}</span>
        <div class="row-actions">
          ${canDelete && !isNew ? '<button type="button" class="btn btn-sm btn-ghost" data-del>Delete</button>' : ''}
          <button type="button" class="btn btn-sm btn-ghost" data-cancel>Close</button>
          ${canEdit ? `<button type="button" class="btn btn-sm" data-save>${isNew ? 'Create' : 'Save changes'}</button>` : ''}
        </div>
      </footer>`;
    $('.close', d).onclick = close;
    $('[data-cancel]', d).onclick = close;
    const sv = $('[data-save]', d); if (sv) sv.onclick = save;
    const del = $('[data-del]', d); if (del) del.onclick = remove;
    $('form', d).addEventListener('submit', (e) => { e.preventDefault(); save(); });
    $('form', d).addEventListener('input', () => { const s = $('.save-state', d); s.className = 'save-state'; s.textContent = 'Unsaved changes'; });
    if (extra) extra($('.extra-slot', d), $('form', d), original);
    if (!isNew) loadHistory();
  };
  async function loadHistory() {
    const r = await req('GET', `/api/history/${collection}/${encodeURIComponent(original[keyField])}`);
    const ul = $('#histList', d);
    if (!ul) return;
    ul.innerHTML = r.ok && r.data.history.length
      ? r.data.history.map((h) => `<li><strong>${esc(h.action)}</strong> by ${esc(h.userId)} <span class="muted">${esc(new Date(h.at).toLocaleString())}</span><span class="muted">${h.fields.length ? `Fields: ${esc(h.fields.join(', '))}` : ''}</span></li>`).join('')
      : '<li class="muted">No changes recorded since the initial import.</li>';
  }
  const collect = () => {
    const out = {};
    for (const f of fields) {
      if (f.readonly) continue;
      const el = $(`[name="${f.key}"]`, d);
      if (!el || el.disabled) continue;
      const v = fieldValue(f, el);
      if (isNew ? !(v === '' || v === null) || f.type === 'bool' : !same(v, original[f.key])) out[f.key] = v;
    }
    return out;
  };
  const showErrors = (errors) => {
    $$('[data-err]', d).forEach((e) => { e.hidden = true; e.closest('.field')?.removeAttribute('data-invalid'); });
    let first = null;
    for (const [k, v] of Object.entries(errors || {})) {
      const el = $(`[data-err="${k}"]`, d);
      if (el) { el.hidden = false; el.textContent = v; el.closest('.field')?.setAttribute('data-invalid', ''); first = first || $(`[name="${k}"]`, d); }
      else toast(`${k}: ${v}`, true);
    }
    first?.focus();
  };
  async function save() {
    const patch = collect();
    const state = $('.save-state', d);
    if (!isNew && !Object.keys(patch).length) { state.className = 'save-state'; state.textContent = 'No changes to save'; return; }
    for (const f of fields) if (f.required && isNew && !patch[f.key]) { showErrors({ [f.key]: 'Required' }); return; }
    state.className = 'save-state'; state.textContent = 'Saving…';
    const r = isNew
      ? await req('POST', `/api/c/${collection}`, patch)
      : await req('PATCH', `/api/c/${collection}/${encodeURIComponent(original[keyField])}`, { ...patch, version: original.version });
    if (r.ok) {
      showErrors({});
      $('.conflict-slot', d).innerHTML = '';
      original = r.data.record;
      if (isNew) { isNew = false; render(original); }
      const s = $('.save-state', d);
      s.className = 'save-state ok'; s.textContent = `Saved · version ${original.version}`;
      toast(`Saved ${original[keyField]}`);
      onSaved?.(original);
      return;
    }
    state.className = 'save-state bad';
    if (r.status === 409 && r.data.current) {
      state.textContent = 'Not saved: newer version exists';
      const theirs = r.data.current;
      const lbl = (k) => fields.find((f) => f.key === k)?.label || k;
      const theirChanges = fields.filter((f) => !(f.key in patch) && !same(theirs[f.key], original[f.key])).map((f) => f.key);
      const rows = Object.keys(patch).map((k) => `<tr><th>${esc(lbl(k))}</th><td>Yours: ${esc(patch[k] ?? 'blank')}</td><td>Saved: ${esc(theirs[k] ?? 'blank')}</td></tr>`).join('')
        + theirChanges.map((k) => `<tr><th>${esc(lbl(k))}</th><td>You did not edit</td><td>Now: ${esc(theirs[k] ?? 'blank')}</td></tr>`).join('');
      $('.conflict-slot', d).innerHTML = `
        <div class="conflict" role="alert">
          <h3>Someone saved this record while you were editing</h3>
          <p>Saved version ${esc(theirs.version)} by ${esc(theirs.updatedBy)}. Your changes were <strong>not</strong> saved.</p>
          <table>${rows}</table>
          <div class="actions">
            <button type="button" class="btn btn-sm" data-reapply>Apply my changes to the latest version</button>
            <button type="button" class="btn btn-sm btn-ghost" data-discard>Discard mine, load latest</button>
          </div>
        </div>`;
      $('[data-reapply]', d).onclick = () => { original = theirs; const mine = { ...theirs, ...patch }; render(mine); const s = $('.save-state', d); s.textContent = 'Review, then save to apply your changes'; onSaved?.(theirs, true); };
      $('[data-discard]', d).onclick = () => { original = theirs; render(theirs); onSaved?.(theirs, true); };
      return;
    }
    state.textContent = 'Not saved';
    if (r.data.errors) showErrors(r.data.errors); else toast(r.data.error || 'Save failed', true);
  }
  async function remove() {
    if (!confirm(`Delete ${original[keyField]}? This cannot be undone.`)) return;
    const r = await req('DELETE', `/api/c/${collection}/${encodeURIComponent(original[keyField])}?version=${original.version}`);
    if (r.ok) { toast('Deleted'); close(); onSaved?.(null); }
    else toast(r.status === 409 ? 'Not deleted: someone changed it. Reopen to review.' : (r.data.error || 'Delete failed'), true);
  }
  render(isNew ? { ...record } : original);
  document.body.append(back, d);
  back.onclick = close;
  document.addEventListener('keydown', onKey);
  ($('input:not([disabled]), select:not([disabled]), textarea:not([disabled])', d) || $('.close', d)).focus();
  return { close };
}

// Filterable table with add/edit/export.
export async function crudTable(host, cfg) {
  const state = { q: '', filters: {}, records: [] };
  host.innerHTML = `
    <div class="filters">
      ${cfg.search ? `<label class="sr-only" for="q-${cfg.collection}">Search</label><input type="search" id="q-${cfg.collection}" placeholder="${esc(cfg.searchLabel || 'Search…')}">` : ''}
      ${(cfg.filters || []).map((f) => `<label class="sr-only" for="flt-${f.key}">${esc(f.label)}</label><select id="flt-${f.key}" data-filter="${f.key}"><option value="">${esc(f.label)}: all</option>${f.options.map((o) => `<option>${esc(o)}</option>`).join('')}</select>`).join('')}
      <span class="muted" data-count aria-live="polite"></span>
      <span class="tools-right"></span>
    </div>
    <div data-body><p class="muted">Loading…</p></div>`;
  const body = $('[data-body]', host);
  const load = async () => {
    const r = await req('GET', `/api/c/${cfg.collection}`);
    if (!r.ok) { body.innerHTML = `<div class="panel"><div class="empty"><h3>${r.status === 403 ? 'Restricted' : 'Could not load'}</h3><p>${esc(r.data.error)}</p></div></div>`; return; }
    state.records = r.data.records;
    cfg.onLoad?.(state.records);
    draw();
  };
  const visible = () => state.records
    .filter((r) => Object.entries(state.filters).every(([k, v]) => !v || r[k] === v))
    .filter((r) => !state.q || (cfg.search || []).some((k) => String(r[k] ?? '').toLowerCase().includes(state.q)))
    .sort(cfg.sort || (() => 0));
  const edit = (rec, isNew = false) => openEditor({
    collection: cfg.collection, title: isNew ? `New ${cfg.noun}` : `${cfg.noun}: ${rec[cfg.titleKey] || rec[cfg.keyField || 'id']}`,
    fields: cfg.fields, record: rec, isNew, keyField: cfg.keyField || 'id', extra: cfg.extra, canEdit: cfg.canEdit !== false, canDelete: !!cfg.canDelete,
    onSaved: () => { load(); cfg.onSaved?.(); },
  });
  const draw = () => {
    const list = visible();
    $('[data-count]', host).textContent = `${list.length} of ${state.records.length}`;
    if (cfg.view && cfg.view() !== 'list') { cfg.renderAlt(body, list, { edit, reload: load }); return; }
    if (!state.records.length) {
      body.innerHTML = `<div class="panel"><div class="empty"><h3>${esc(cfg.emptyTitle || 'Nothing recorded yet')}</h3><p>${esc(cfg.emptyText || '')}</p>${cfg.canEdit !== false ? `<button class="btn btn-sm" data-add>Add ${esc(cfg.noun.toLowerCase())}</button>` : ''}</div></div>`;
      const a = $('[data-add]', body); if (a) a.onclick = () => edit(cfg.defaults ? cfg.defaults() : {}, true);
      return;
    }
    if (!list.length) { body.innerHTML = '<div class="panel"><div class="empty"><h3>No matches</h3><p>Change the search or filters.</p></div></div>'; return; }
    body.innerHTML = `
      <div class="tbl-wrap"><table class="tbl">
        <caption class="sr-only">${esc(cfg.noun)} records</caption>
        <thead><tr>${cfg.columns.map((c) => `<th scope="col" class="${c.num ? 'num' : ''}">${esc(c.label)}</th>`).join('')}<th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
        <tbody>${list.map((r) => `<tr>${cfg.columns.map((c) => `<td class="${c.num ? 'num' : ''}">${c.render ? c.render(r) : esc(r[c.key] ?? '')}</td>`).join('')}<td><div class="row-actions">${cfg.rowExtra ? cfg.rowExtra(r) : ''}<button class="btn btn-sm btn-ghost" data-edit="${esc(r[cfg.keyField || 'id'])}">${cfg.canEdit === false ? 'View' : 'Edit'}<span class="sr-only"> ${esc(r[cfg.titleKey] || '')}</span></button></div></td></tr>`).join('')}</tbody>
        ${cfg.footer ? `<tfoot>${cfg.footer(list)}</tfoot>` : ''}
      </table></div>`;
    $$('[data-edit]', body).forEach((b) => b.addEventListener('click', () => edit(state.records.find((r) => String(r[cfg.keyField || 'id']) === b.dataset.edit))));
    cfg.wireRow?.(body, { reload: load, records: state.records });
  };
  const qi = $(`#q-${cfg.collection}`, host);
  if (qi) qi.addEventListener('input', () => { state.q = qi.value.trim().toLowerCase(); draw(); });
  $$('[data-filter]', host).forEach((s) => s.addEventListener('change', () => { state.filters[s.dataset.filter] = s.value; draw(); }));
  await load();
  return { reload: load, add: () => edit(cfg.defaults ? cfg.defaults() : {}, true), redraw: draw, records: () => state.records };
}
