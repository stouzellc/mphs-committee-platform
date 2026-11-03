import { fmtMoney, PENDING } from '/shared/finance.js';

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let toastTimer;
export function toast(msg, isError = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('error', isError);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

const PILL = {
  Pending: 'pending', 'Awaiting decisions': 'pending', 'Pending approval': 'pending', 'Not started': 'muted', Blocked: 'restricted',
  Approved: 'approved', Done: 'approved', Confirmed: 'approved', Committed: 'approved', Paid: 'approved', Selected: 'approved', 'Posted manually': 'approved',
  Proposed: 'proposed', Proposal: 'proposed', Concept: 'proposed', 'In progress': 'proposed', Drafting: 'proposed', 'Ready for review': 'proposed', Prospect: 'proposed', Submitted: 'proposed', Received: 'proposed', Shortlisted: 'proposed', Requested: 'muted',
  Superseded: 'muted', Rejected: 'muted', Declined: 'muted', Withdrawn: 'muted', Void: 'muted', Failed: 'restricted', Cut: 'muted',
};
export const pill = (status, label) => `<span class="pill pill-${PILL[status] || 'muted'}">${esc(label || status || '—')}</span>`;
export const demoPill = (r) => (r && r.demo ? ' <span class="pill pill-demo">Demo</span>' : '');
// A memory photo in a square frame. Location and camera data were removed on upload, so the saved
// EXIF orientation (1-8) is applied here to keep phone photos upright.
export const memoryPhoto = (m, size = 'sm') => (m && m.photo
  ? `<span class="memphoto memphoto-${size}"><img class="orient-${Number(m.photo.orientation) || 1}" src="/api/memories/${encodeURIComponent(m.id)}/photo" alt="Photo shared with “${esc(m.title)}”" loading="lazy"></span>`
  : '');
export const money = (v) => (v === null || v === undefined || v === PENDING ? `<span class="pend">${PENDING}</span>` : esc(fmtMoney(v)));
export const orPending = (v) => (v === null || v === undefined || v === '' ? `<span class="pend">${PENDING}</span>` : esc(v));

export function observeReveals(root) {
  const els = $$('.reveal', root);
  if (reducedMotion() || !('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return; }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }, { threshold: 0.12 });
  els.forEach((e) => io.observe(e));
}

// Artwork viewer: keyboard (arrows, +, -, 0, Esc), click/tap to zoom, drag to pan.
export function openLightbox(items, index = 0, opener) {
  const dlg = $('#lightbox');
  let i = index;
  let scale = 1, tx = 0, ty = 0;
  const render = () => {
    const a = items[i];
    dlg.innerHTML = `
      <div class="lb-shell">
        <div class="lb-bar">
          <span class="count">${i + 1} / ${items.length}</span>
          <div class="lb-tools">
            <button type="button" data-z="out" aria-label="Zoom out">−</button>
            <button type="button" data-z="reset" aria-label="Reset zoom">1:1</button>
            <button type="button" data-z="in" aria-label="Zoom in">+</button>
            <button type="button" data-close aria-label="Close viewer">✕</button>
          </div>
        </div>
        <div class="lb-stage">
          ${items.length > 1 ? '<button type="button" class="lb-nav lb-prev" aria-label="Previous artwork">←</button>' : ''}
          <img src="${esc(a.src)}" alt="${esc(a.alt)}" draggable="false">
          ${items.length > 1 ? '<button type="button" class="lb-nav lb-next" aria-label="Next artwork">→</button>' : ''}
        </div>
        <div class="lb-caption">
          <h2>${esc(a.title)}</h2>
          <p>${esc(a.caption)} · User-created illustration (Midjourney), not an archival photograph.</p>
        </div>
      </div>`;
    scale = 1; tx = 0; ty = 0; apply();
    wire();
  };
  const apply = () => {
    const img = $('.lb-stage img', dlg);
    if (!img) return;
    img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    $('.lb-stage', dlg).classList.toggle('zoomed', scale > 1);
  };
  const zoom = (d) => { scale = Math.min(4, Math.max(1, d === 0 ? 1 : scale + d)); if (scale === 1) { tx = 0; ty = 0; } apply(); };
  const go = (d) => {
    const fromBtn = document.activeElement?.classList.contains('lb-prev') ? '.lb-prev' : document.activeElement?.classList.contains('lb-next') ? '.lb-next' : '[data-close]';
    i = (i + d + items.length) % items.length;
    render();
    ($(fromBtn, dlg) || $('[data-close]', dlg)).focus();
  };
  function wire() {
    $('[data-close]', dlg).onclick = () => dlg.close();
    $('[data-z="in"]', dlg).onclick = () => zoom(0.75);
    $('[data-z="out"]', dlg).onclick = () => zoom(-0.75);
    $('[data-z="reset"]', dlg).onclick = () => zoom(0);
    const p = $('.lb-prev', dlg); if (p) p.onclick = () => go(-1);
    const n = $('.lb-next', dlg); if (n) n.onclick = () => go(1);
    const img = $('.lb-stage img', dlg);
    let drag = null, moved = false;
    img.addEventListener('pointerdown', (e) => { drag = { x: e.clientX - tx, y: e.clientY - ty }; moved = false; img.setPointerCapture(e.pointerId); });
    img.addEventListener('pointermove', (e) => { if (!drag || scale === 1) return; moved = true; tx = e.clientX - drag.x; ty = e.clientY - drag.y; apply(); });
    img.addEventListener('pointerup', () => { if (!moved) zoom(scale > 1 ? 0 : 1.25); drag = null; });
  }
  dlg.onkeydown = (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    else if (e.key === '+' || e.key === '=') zoom(0.75);
    else if (e.key === '-') zoom(-0.75);
    else if (e.key === '0') zoom(0);
  };
  dlg.onclose = () => { dlg.innerHTML = ''; if (opener) opener.focus(); };
  render();
  dlg.showModal();
  $('[data-close]', dlg).focus();
}

export function setTitle(t) { document.title = t ? `${t} · MPHS Class of 2008` : 'MPHS Class of 2008'; }
