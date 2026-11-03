import { $, $$, esc, pill, observeReveals, openLightbox, setTitle } from '../ui.js';
import { ART, art, STEPS, SURVEY, COST_PARTS, QUOTE_FIELDS, QUESTIONS, CRUISE_NEXT, CRUISE_SLIDES, CRUISE_IDENTITY, SOCIAL } from '../content.js';
import { parseMoney, fmtMoney } from '/shared/finance.js';
import { renderDeck, chapterSpy } from './present.js';

const CHAPTERS = [['c-cover', 'Cover'], ['c-idea', 'More time together'], ['c-steps', 'Interest to booking'], ['c-options', 'Fair comparison'], ['c-cabins', 'Cabins'], ['c-qs', 'Travel questions'], ['c-next', 'Next decisions']];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

function listFor(key) {
  if (key === 'survey') return SURVEY.map(([t, d]) => [`${t}: ${d}`, '']);
  if (key === 'steps') return STEPS.map((s, i) => [`${i + 1}. ${s.name}: ${s.means}`, '']);
  if (key === 'cost') return COST_PARTS.map(([t, d]) => [`${t}: ${d}`, pill('Pending')]);
  if (key === 'next') return CRUISE_NEXT.map(([d, u]) => [`${d} → ${u}`, pill('Pending')]);
  return [];
}

const label = (i, t) => `<div class="c-label"><span class="roman">${ROMAN[i]}</span><span>${esc(t)}</span></div>`;

function storyBar(view) {
  return `
  <div class="story-bar">
    <nav class="chapters" aria-label="Cruise chapters">${view === 'text' ? '' : CHAPTERS.map(([id, t], i) => `<a href="#/cruise" data-target="${id}" aria-current="${i === 0}">${t}</a>`).join('')}</nav>
    <div class="actions">
      <div class="view-toggle" role="group" aria-label="View">
        <button type="button" data-view="story" aria-pressed="${view !== 'text'}">Story</button>
        <button type="button" data-view="text" aria-pressed="${view === 'text'}">Text</button>
      </div>
      <a class="btn btn-sm btn-light" href="#/cruise/present">Present ▸</a>
    </div>
  </div>`;
}

function textView() {
  return `
  <article class="textview">
    <h1>Pleasant, Beyond the Shore</h1>
    <p class="meta">Mount Pleasant High School Class of 2008 · A separate cruise concept for 2028. Nothing is booked yet: no cruise line, ship, dates or prices. Everything below is a plan.</p>
    <h2>More time together</h2>
    <p>The conversations that don’t fit into one evening. A shared trip is a possibility for classmates who want to reconnect over several days. Whether the cruise is a companion or an alternative to the reunion is pending (D004).</p>
    <h2>The class chooses the shape of the trip</h2>
    <ul>${SURVEY.map(([t, d]) => `<li><strong>${esc(t)}.</strong> ${esc(d)}</li>`).join('')}</ul>
    <h2>Interest becomes a booking in stages</h2>
    <ol>${STEPS.map((s) => `<li><strong>${esc(s.name)}.</strong> ${esc(s.means)} It does not mean: ${esc(s.not)} Who acts: ${esc(s.who)}</li>`).join('')}</ol>
    <h2>A fair comparison</h2>
    <p>No offers have been received. Each option will record: ${QUOTE_FIELDS.map(esc).join(', ')}.</p>
    <h2>The full cost of joining</h2>
    <ul>${COST_PARTS.map(([t, d]) => `<li><strong>${esc(t)}.</strong> ${esc(d)}</li>`).join('')}</ul>
    <h2>Cabins and travel coordination</h2>
    <p>One cabin record, separate traveler records. A cabin identifier prevents double counting. Roommates are confirmed directly and their details stay private. Provider confirmation comes before a booking is marked complete.</p>
    <h2>Travel questions</h2>
    ${QUESTIONS.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join('')}
    <h2>The next cruise decisions</h2>
    <ul>${CRUISE_NEXT.map(([d, u]) => `<li><strong>${esc(d)}</strong> unlocks ${esc(u.toLowerCase())}.</li>`).join('')}</ul>
    <p>${esc(CRUISE_IDENTITY)}</p>
    <p>Approved updates appear on the class <a href="${SOCIAL.facebook}" rel="noopener noreferrer" target="_blank">Facebook Page</a> and <a href="${SOCIAL.instagram}" rel="noopener noreferrer" target="_blank">Instagram</a>. Booking details follow a confirmed offer.</p>
  </article>`;
}

function storyView() {
  const a3 = art('mj-3'), a2 = art('mj-2'), a4 = art('mj-4');
  return `
  <section class="c-chapter" id="c-cover" aria-labelledby="cTitle">
    <div class="c-inner c-cover">
      <div>
        ${label(0, 'Mount Pleasant High School · Class of 2008')}
        <h1 class="c-title" id="cTitle"><span class="l1">Pleasant,</span><span class="l2">Beyond the <b>Shore</b></span></h1>
        <svg class="horizon" viewBox="0 0 520 40" aria-hidden="true" focusable="false"><path d="M0 22 C 40 10, 80 34, 120 22 S 200 10, 240 22 S 320 34, 360 22 S 440 10, 520 22" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>
        <p class="c-lede">A separate cruise concept for 2028. Nothing is booked yet: no cruise line, ship, dates or prices. Everything below is a plan.</p>
        <p class="notice-line">${pill('Pending', 'Nothing booked')}</p>
      </div>
      <figure class="arch reveal">
        <div class="frame"><div class="frame-inner"><button type="button" data-art="mj-3" aria-label="Enlarge: ${esc(a3.title)}"><img src="${a3.src}" alt="${esc(a3.alt)}" width="960" height="1200"></button></div></div>
        <figcaption class="cap">Illustration · not a ship or destination</figcaption>
      </figure>
    </div>
  </section>

  <section class="c-chapter c-ivory" id="c-idea" aria-labelledby="cIdeaH">
    <div class="c-inner">
      ${label(1, 'More time together')}
      <h2 class="c-h" id="cIdeaH">The conversations that don’t fit into <em>one evening</em></h2>
      <p class="c-lede">A shared trip is a possibility for classmates who want to reconnect over several days. Whether it accompanies the reunion or serves as an alternative is still open.</p>
      <div class="rel-grid">
        <div class="rel-card reveal"><h3><em>Companion</em> trip</h3><p>Sails in the reunion year for classmates who want more time together.</p><p class="mt-18">${pill('Pending', 'Decision D004')}</p></div>
        <div class="rel-card reveal"><h3><em>Alternative</em> experience</h3><p>A different way to reconnect for classmates who prefer travel.</p><p class="mt-18">${pill('Pending', 'Decision D004')}</p></div>
      </div>
      <h3 class="c-sub">The class chooses the shape of the trip</h3>
      <div class="survey-grid">
        ${SURVEY.map(([t, d], i) => `<div class="survey reveal"><span class="sn">${String(i + 1).padStart(2, '0')}</span><h4>${esc(t)}</h4><p>${esc(d)}</p></div>`).join('')}
      </div>
      <p class="caption-note">The interest survey still needs committee approval (task T004).</p>
    </div>
  </section>

  <section class="c-chapter" id="c-steps" aria-labelledby="cStepsH">
    <div class="c-inner">
      ${label(2, 'Interest becomes a booking in stages')}
      <h2 class="c-h" id="cStepsH">From interest to booking, <em>in four steps</em></h2>
      <p class="c-lede">Select a stage to see what it means, what it does not mean, and who acts. Use the arrow keys to move between stages.</p>
      <div class="stepper">
        <ol class="step-track" role="tablist" aria-label="Booking stages">
          ${STEPS.map((s, i) => `<li role="presentation"><button type="button" role="tab" id="st${i}" aria-controls="stepPanel" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}"><span class="node">${i + 1}</span><span class="nm">${esc(s.name)}</span></button></li>`).join('')}
        </ol>
        <div class="step-panel" id="stepPanel" role="tabpanel" aria-labelledby="st0"></div>
      </div>
    </div>
  </section>

  <section class="c-chapter c-ivory" id="c-options" aria-labelledby="cOptH">
    <div class="c-inner">
      ${label(3, 'Cruise options need a fair comparison')}
      <h2 class="c-h" id="cOptH">Written offers, <em>on the same basis</em></h2>
      <p class="c-lede">These cards fill in when written quotes arrive.</p>
      <div class="options">
        ${['A', 'B', 'C'].map((x) => `
        <article class="option reveal" aria-label="Option ${x}, quote pending">
          <h3>Option <em>${x}</em></h3>
          ${pill('Pending', 'Quote pending')}
          <dl>${QUOTE_FIELDS.map((f) => `<dt>${esc(f)}</dt><dd>Pending</dd>`).join('')}</dl>
        </article>`).join('')}
      </div>
      <h3 class="c-sub">The full cost of joining</h3>
      <p class="c-body">Per-person and per-cabin prices must be labelled separately.</p>
      <div class="cost-grid">
        ${COST_PARTS.map(([t, d], i) => `<div class="cost reveal"><span class="sn">${i + 1}</span><h4>${esc(t)}</h4><p>${esc(d)}</p>${pill('Pending')}</div>`).join('')}
      </div>
      <form class="calc" id="calc" aria-labelledby="calcH" novalidate>
        <h3 id="calcH">Per person or per cabin? ${pill('Proposed', 'Practice numbers, not a quote')}</h3>
        <div class="calc-in">
          <div class="field"><label for="cAmt">A price you have seen (USD)</label><input id="cAmt" inputmode="decimal" autocomplete="off" placeholder="e.g. 1800"><span class="err" id="cAmtErr" hidden></span></div>
          <div class="field"><label for="cBasis">That price is quoted…</label><select id="cBasis"><option>Per cabin</option><option>Per person</option></select></div>
          <div class="field"><label for="cOcc">Travelers sharing the cabin</label><select id="cOcc"><option>1</option><option selected>2</option><option>3</option><option>4</option></select><span class="hint">Always check the occupancy basis a quote assumes.</span></div>
        </div>
        <div class="calc-out" aria-live="polite">
          <div><div class="lbl">Per person</div><div class="big" id="cPP">—</div></div>
          <div><div class="lbl">Per cabin</div><div class="big" id="cPC">—</div></div>
          <p class="expl" id="cExpl">Enter a number to see how per-person and per-cabin prices relate. Taxes, fees, gratuities and travel to the port are separate unless a quote says otherwise.</p>
        </div>
      </form>
    </div>
  </section>

  <section class="c-chapter" id="c-cabins" aria-labelledby="cCabH">
    <div class="c-inner cabins-grid">
      <div>
        ${label(4, 'Cabins and travel coordination')}
        <h2 class="c-h" id="cCabH">One cabin record. <em>Separate travelers.</em></h2>
        <p class="c-lede">Use a cabin identifier to prevent double counting. Confirm roommates directly and keep their details private. Record provider confirmation before marking a booking complete.</p>
        <div class="cabin-diagram" role="img" aria-label="Diagram: two travelers assigned to one cabin identifier count as one booked cabin.">
          <div class="traveler"><span>Traveler one</span><span>Traveler two</span></div>
          <div class="cabin-arrow" aria-hidden="true">→</div>
          <div class="cabin-box"><div class="id">CABIN ID · CONFIRMED</div><div class="count">1</div><p>booked cabin</p></div>
        </div>
      </div>
      <button type="button" class="arch-mini reveal" data-art="mj-4" aria-label="Enlarge: ${esc(a4.title)}"><img src="${a4.src}" alt="${esc(a4.alt)}" loading="lazy"></button>
    </div>
  </section>

  <section class="c-chapter c-ivory" id="c-qs" aria-labelledby="cQsH">
    <div class="c-inner">
      ${label(5, 'Travel questions, answered privately')}
      <h2 class="c-h" id="cQsH">What you’ll <em>want to know</em></h2>
      <p class="c-lede">A private way to ask about your own travel will be set up before bookings open.</p>
      <div class="qa">
        ${QUESTIONS.map(([q, a]) => `<details><summary>${esc(q)} <span class="plus" aria-hidden="true">+</span></summary><div class="ans"><p>${esc(a)}</p></div></details>`).join('')}
      </div>
    </div>
  </section>

  <section class="c-chapter c-final" id="c-next" aria-labelledby="cNextH">
    <div class="c-inner">
      ${label(6, 'The next cruise decisions')}
      <h2 class="c-h" id="cNextH">The class <em>comes first</em></h2>
      <table class="next-table">
        <caption class="sr-only">Cruise decisions and what they unlock</caption>
        <thead><tr><th scope="col">Decision</th><th scope="col">What it unlocks</th><th scope="col">Status</th></tr></thead>
        <tbody>${CRUISE_NEXT.map(([d, u]) => `<tr><th scope="row">${esc(d)}</th><td>${esc(u)}</td><td>${pill('Pending')}</td></tr>`).join('')}</tbody>
      </table>
      <p class="c-lede mt-24">${esc(CRUISE_IDENTITY)}</p>
      <p class="c-lede">Approved updates appear on the existing Facebook Page and Instagram. Booking details follow a confirmed offer.</p>
      <div class="cta-row">
        <a class="btn btn-light" href="${SOCIAL.facebook}" rel="noopener noreferrer" target="_blank">Follow the Facebook Page <span class="sr-only">(opens in a new tab)</span></a>
        <a class="btn btn-outline-light" href="${SOCIAL.instagram}" rel="noopener noreferrer" target="_blank">Follow @mph_classof08 <span class="sr-only">(opens in a new tab)</span></a>
      </div>
      <button type="button" class="arch-mini center mt-24" data-art="mj-2" aria-label="Enlarge: ${esc(a2.title)}"><img src="${a2.src}" alt="${esc(a2.alt)}" loading="lazy"></button>
    </div>
  </section>`;
}

function wireStepper(main) {
  const tabs = $$('.step-track [role="tab"]', main);
  const panel = $('#stepPanel', main);
  const select = (i, focus) => {
    tabs.forEach((t, n) => { t.setAttribute('aria-selected', String(n === i)); t.tabIndex = n === i ? 0 : -1; });
    panel.setAttribute('aria-labelledby', tabs[i].id);
    const s = STEPS[i];
    panel.innerHTML = `<div><h4>What it means</h4><p>${esc(s.means)}</p></div><div><h4>What it does not mean</h4><p>${esc(s.not)}</p></div><div><h4>Who acts</h4><p>${esc(s.who)}</p></div>`;
    if (focus) tabs[i].focus();
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(i));
    t.addEventListener('keydown', (e) => {
      const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (d) { e.preventDefault(); select((i + d + tabs.length) % tabs.length, true); }
      if (e.key === 'Home') { e.preventDefault(); select(0, true); }
      if (e.key === 'End') { e.preventDefault(); select(tabs.length - 1, true); }
    });
  });
  select(0);
}

function wireCalc(main) {
  const amt = $('#cAmt', main), basis = $('#cBasis', main), occ = $('#cOcc', main);
  const r2 = (n) => Math.round(n * 100) / 100;
  const update = () => {
    const v = parseMoney(amt.value);
    const err = $('#cAmtErr', main);
    const field = amt.closest('.field');
    const clear = () => { $('#cPP', main).textContent = '—'; $('#cPC', main).textContent = '—'; };
    if (Number.isNaN(v) || (v !== null && v < 0)) {
      err.hidden = false; err.textContent = 'Enter a number like 1800 or 1800.50.'; field.setAttribute('data-invalid', ''); amt.setAttribute('aria-invalid', 'true');
      clear(); return;
    }
    err.hidden = true; field.removeAttribute('data-invalid'); amt.removeAttribute('aria-invalid');
    if (v === null) { clear(); return; }
    const n = Number(occ.value);
    const perCabin = basis.value === 'Per cabin' ? v : v * n;
    const perPerson = basis.value === 'Per cabin' ? v / n : v;
    $('#cPP', main).textContent = fmtMoney(r2(perPerson));
    $('#cPC', main).textContent = fmtMoney(r2(perCabin));
    $('#cExpl', main).textContent = basis.value === 'Per cabin'
      ? `A per-cabin price of ${fmtMoney(v)} shared by ${n} is ${fmtMoney(r2(perPerson))} each. If someone drops out, the others’ share rises.`
      : `A per-person price of ${fmtMoney(v)} for ${n} sharing is ${fmtMoney(r2(perCabin))} for the cabin. Solo travelers often pay a supplement.`;
  };
  [amt, basis, occ].forEach((el) => el.addEventListener('input', update));
  $('#calc', main).addEventListener('submit', (e) => e.preventDefault());
}

export function renderCruise(main, mode) {
  if (mode === 'present') {
    return renderDeck(main, { theme: 'c', title: 'Pleasant, Beyond the Shore', slides: CRUISE_SLIDES, listFor, exitHash: '#/cruise' });
  }
  setTitle('Pleasant, Beyond the Shore');
  main.innerHTML = `<div class="story cruise on-navy">${storyBar(mode)}${mode === 'text' ? textView() : storyView()}</div>`;
  $$('[data-view]', main).forEach((b) => b.addEventListener('click', () => { location.hash = b.dataset.view === 'text' ? '#/cruise/text' : '#/cruise'; }));
  $$('[data-art]', main).forEach((b) => b.addEventListener('click', () => {
    const items = ART.filter((a) => a.events.includes('Cruise'));
    openLightbox(items, Math.max(0, items.findIndex((a) => a.id === b.dataset.art)), b);
  }));
  if (mode !== 'text') { wireStepper(main); wireCalc(main); }
  observeReveals(main);
  return mode === 'text' ? null : chapterSpy(main, '.c-chapter');
}
