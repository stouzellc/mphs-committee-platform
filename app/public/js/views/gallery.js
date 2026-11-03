import { $, $$, esc, openLightbox, observeReveals, setTitle, memoryPhoto } from '../ui.js';
import { req, currentUser } from '../api.js';
import { ART } from '../content.js';

const FILTERS = [
  ['all', 'All seven'], ['Mascot portrait', 'Mascot portraits'], ['Memories collage', 'Memories'], ['Identity', 'Identity'],
  ['ev:Reunion', 'Used in the reunion'], ['ev:Cruise', 'Used in the cruise'],
];

export function renderGallery(main) {
  setTitle('Living memories gallery');
  let filter = 'all';
  main.innerHTML = `
  <div class="gallery">
    <header class="g-head">
      <div>
        <p class="kicker">Living memories · ${ART.length} artworks</p>
        <h1>The <em>Kiltie</em>, the jacket &amp; the seal</h1>
      </div>
      <p>User-created illustrations made with Midjourney and approved for this project on 25 October 2026, plus the reunion seal from the v1 source deck. They are artwork, not archival photographs: people in the backgrounds are not real classmates and writing in the images is decorative.</p>
    </header>
    <div class="g-filters" role="group" aria-label="Filter artwork">
      ${FILTERS.map(([v, l]) => `<button type="button" class="chip" data-f="${esc(v)}" aria-pressed="${v === 'all'}">${esc(l)}</button>`).join('')}
    </div>
    <p class="sr-only" id="gCount" aria-live="polite"></p>
    <div class="g-grid" id="gGrid"></div>
    <section class="g-memories" id="gMem" aria-labelledby="gMemH" hidden>
      <h2 id="gMemH">Shared memories</h2>
      <p class="muted">Stories and photos from members, shown only after a reviewer approved them for this gallery, with permission. Visible to signed-in members only.</p>
      <div class="g-mem-grid" id="gMemGrid"></div>
    </section>
    <section class="g-submit" aria-labelledby="gSubH">
      <div class="g-submit-inner">
        <div>
          <h2 id="gSubH">Add your own memory</h2>
          <p>Signed-in classmates can submit a story. Organizers review every submission, nothing is published by default, and you can withdraw yours at any time.</p>
        </div>
        <a class="btn btn-light" href="#/me">Open the classmate area</a>
      </div>
    </section>
  </div>`;

  const visible = () => ART.filter((a) => filter === 'all' || (filter.startsWith('ev:') ? a.events.includes(filter.slice(3)) : a.type === filter));
  const draw = () => {
    const list = visible();
    $('#gGrid', main).innerHTML = list.map((a) => `
      <figure class="g-item reveal">
        <button type="button" data-id="${a.id}" aria-label="Open ${esc(a.title)} in the viewer">
          <img src="${a.thumb}" srcset="${a.thumb} 480w, ${a.src} 960w" sizes="(max-width: 700px) 92vw, (max-width: 1100px) 46vw, 400px" alt="${esc(a.alt)}" width="${a.w}" height="${a.h}" loading="lazy">
        </button>
        <figcaption>
          <h2>${esc(a.title)}</h2>
          <p>${esc(a.caption)}</p>
          <div class="tags"><span class="pill pill-muted">${esc(a.type)}</span>${a.events.map((e) => `<span class="pill pill-proposed">${esc(e)}</span>`).join('')}<span class="pill pill-approved">Approved use · ${esc(a.asset)}</span></div>
        </figcaption>
      </figure>`).join('');
    $('#gCount', main).textContent = `${list.length} artworks shown`;
    $$('.g-item button', main).forEach((b) => b.addEventListener('click', () => openLightbox(list, list.findIndex((a) => a.id === b.dataset.id), b)));
    observeReveals(main);
  };
  $$('.chip', main).forEach((c) => c.addEventListener('click', () => {
    filter = c.dataset.f;
    $$('.chip', main).forEach((x) => x.setAttribute('aria-pressed', String(x === c)));
    draw();
  }));
  draw();
  loadShared(main);
}

async function loadShared(main) {
  if (!currentUser()) return;
  const r = await req('GET', '/api/memories/approved');
  if (!r.ok || !r.data.records.length) return;
  $('#gMemGrid', main).innerHTML = r.data.records.map((m) => `
    <article class="g-mem">
      ${memoryPhoto(m, 'lg')}
      <div><h3>${esc(m.title)}</h3><p>${esc(m.story)}</p>${m.approvedUse ? `<p class="muted">Approved use: ${esc(m.approvedUse)}</p>` : ''}</div>
    </article>`).join('');
  $('#gMem', main).hidden = false;
}
