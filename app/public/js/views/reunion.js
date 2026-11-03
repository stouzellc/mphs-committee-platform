import { $, $$, esc, pill, observeReveals, openLightbox, setTitle } from '../ui.js';
import { ART, art, PROGRAM, PROGRAM_GROUPS, KNOWN, OPEN_REUNION, DATE_VENUE, BUDGET, NEXT_REUNION, CLASS_PAGES, ROADMAP, DETAILS, CONTRIB, PEOPLE, PEOPLE_NOTE, REUNION_SLIDES, SOCIAL } from '../content.js';
import { renderDeck, chapterSpy } from './present.js';

const CHAPTERS = [
  ['r-open', 'Opening'], ['r-twenty', 'The people we remember'], ['r-known', 'Known & open'], ['r-decide', 'Date, venue & budget'], ['r-memories', 'Memories'],
  ['r-program', 'Proposed experience'], ['r-people', 'People'], ['r-plan', 'Planning sequence'], ['r-help', 'Take part'], ['r-next', 'Next decisions'],
];
const budgetPill = (t) => (t === 'Contingency' ? pill('Proposed', 'Assumption') : pill('Pending'));

const extLink = (href, label) => `<a href="${esc(href)}" ${href.startsWith('http') ? 'rel="noopener noreferrer" target="_blank"' : ''}>${esc(label)}${href.startsWith('http') ? ' ↗<span class="sr-only"> (opens in a new tab)</span>' : ' →'}</a>`;

function listFor(key) {
  if (key === 'knownopen') return [...KNOWN.map(([k]) => [k, pill('Approved', 'Known')]), ...OPEN_REUNION.map((o) => [o, pill('Pending')])];
  if (key === 'groups') return PROGRAM_GROUPS.map(([n, d]) => [`${n}: ${d}`, pill('Proposed')]);
  if (key === 'contribute') return CONTRIB.map(([t, d]) => [`${t}. ${d}`, '']);
  if (key === 'people') return PEOPLE.map(([n, r]) => [`${n}: ${r}`, pill('Pending', 'Title pending')]);
  if (key === 'roadmap') return ROADMAP.map(([s, w], i) => [`${i + 1}. ${s}: ${w}`, i === 0 ? pill('In progress', 'Now') : pill('Pending')]);
  if (key === 'details') return DETAILS.map((d) => [d, pill('Proposed', 'Idea')]);
  if (key === 'datevenue') return DATE_VENUE.map(([d, n]) => [`${d}: ${n}`, pill('Pending')]);
  if (key === 'budget') return BUDGET.map(([t, d]) => [`${t}: ${d}`, budgetPill(t)]);
  return [];
}

function storyBar(view) {
  return `
  <div class="story-bar">
    <nav class="chapters" aria-label="Reunion chapters">${view === 'text' ? '' : CHAPTERS.map(([id, t], i) => `<a href="#/reunion" data-target="${id}" aria-current="${i === 0}">${t}</a>`).join('')}</nav>
    <div class="actions">
      <div class="view-toggle" role="group" aria-label="View">
        <button type="button" data-view="story" aria-pressed="${view !== 'text'}">Story</button>
        <button type="button" data-view="text" aria-pressed="${view === 'text'}">Text</button>
      </div>
      <a class="btn btn-sm" href="#/reunion/present">Present ▸</a>
    </div>
  </div>`;
}

function textView() {
  return `
  <article class="textview">
    <h1>Back to Pleasant</h1>
    <p class="meta">Mount Pleasant High School Class of 2008 · 20-year reunion planning for 2028. Date, venue and tickets aren’t set yet. Everything below is a proposal.</p>
    <h2>The people we remember</h2>
    <p>The hallway conversations. The music. The people who made school feel like ours. A night to reconnect, with room for everyone’s story.</p>
    <h2>What we know</h2>
    <ul>${KNOWN.map(([k, s]) => `<li>${esc(k)} <span class="meta">(${esc(s)})</span></li>`).join('')}</ul>
    <h2>Decisions still open</h2>
    <ul>${OPEN_REUNION.map((o) => `<li>${esc(o)}: Pending</li>`).join('')}</ul>
    <h2>The date and venue decision</h2>
    <ul>${DATE_VENUE.map(([d, n]) => `<li><strong>${esc(d)}.</strong> Information needed: ${esc(n.toLowerCase())}.</li>`).join('')}</ul>
    <h2>The reunion budget</h2>
    <p class="meta">A complete estimate comes before ticket prices.</p>
    <ul>${BUDGET.map(([t, d]) => `<li><strong>${esc(t)}.</strong> ${esc(d)}</li>`).join('')}</ul>
    <h2>Memories</h2>
    <p>Stories and photos can become part of the celebration with permission. Every submission is reviewed and you can withdraw yours. The collage artwork is an illustration, not a yearbook page.</p>
    <h2>A class directory with care</h2>
    <p>318 classmates on our starting list. We’re still checking it against the yearbook. Being on the list doesn’t mean you’ve been contacted or signed up, and personal details stay private.</p>
    <h2>Proposed experience</h2>
    <p class="meta">A flexible program to shape around the venue and budget. Every segment is a proposal; times and owners are pending.</p>
    <ol>${PROGRAM.map(([n, [g]]) => `<li>${esc(n)} <span class="meta">(${esc(g)})</span></li>`).join('')}</ol>
    <h2>The details that make it ours</h2>
    <ul>${DETAILS.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>
    <p class="meta">Ideas for committee review, subject to budget and permission.</p>
    <h2>The people making it happen</h2>
    <ul>${PEOPLE.map(([n, r]) => `<li><strong>${esc(n)}</strong>: ${esc(r)}</li>`).join('')}</ul>
    <p class="meta">${esc(PEOPLE_NOTE)}</p>
    <h2>Planning sequence</h2>
    <ol>${ROADMAP.map(([s, w]) => `<li><strong>${esc(s)}.</strong> ${esc(w)}.</li>`).join('')}</ol>
    <h2>Take part</h2>
    <ul>${CONTRIB.map(([t, d, href, l]) => `<li><strong>${esc(t)}.</strong> ${esc(d)} ${extLink(href, l)}</li>`).join('')}</ul>
    <h2>The next decisions</h2>
    <ol>${NEXT_REUNION.map((d) => `<li>${esc(d)}: Pending</li>`).join('')}</ol>
    <h2>The class pages</h2>
    <p>${esc(CLASS_PAGES)} ${extLink(SOCIAL.facebook, 'Facebook Page')} · ${extLink(SOCIAL.instagram, '@mph_classof08')}</p>
  </article>`;
}

function storyView() {
  const a6 = art('mj-6'), a5 = art('mj-5'), a1 = art('mj-1');
  return `
  <section class="r-chapter r-open grain" id="r-open" aria-labelledby="rTitle">
    <div class="r-inner r-open-grid">
      <div>
        <div class="r-label"><span class="n">01</span><span class="t">Mount Pleasant High School · Class of 2008</span></div>
        <h1 class="r-title" id="rTitle">Back to <span>Pleasant</span></h1>
        <p class="r-lede">20-year reunion planning for 2028. A reunion shaped around the class and the memories we share.</p>
        <p class="r-body">${pill('Pending', 'Not set yet')} Date, venue and tickets aren’t set yet. Everything below is a proposal.</p>
        <div class="cta-row">
          <a class="btn btn-crimson" href="#/reunion/present">Start the presentation</a>
          <a class="btn btn-ghost" href="#/gallery">See the artwork</a>
        </div>
      </div>
      <div class="r-jacket reveal">
        <div class="frame"><span class="tape" aria-hidden="true"></span>
          <button type="button" class="collage-btn" data-art="mj-6" aria-label="Enlarge: ${esc(a6.title)}"><img src="${a6.src}" alt="${esc(a6.alt)}" width="960" height="1200"></button>
        </div>
        <div class="badge" aria-hidden="true"><span>CLASS OF<b>’08</b>20 YEARS</span></div>
      </div>
    </div>
  </section>

  <section class="r-chapter r-twenty" id="r-twenty" aria-labelledby="rTwentyH">
    <div class="r-inner twenty-grid">
      <div class="big20 reveal" aria-hidden="true">20</div>
      <div>
        <div class="r-label"><span class="n">02</span><span class="t">The people we remember</span></div>
        <h2 class="r-h" id="rTwentyH">Room for everyone’s <span class="accent">story</span></h2>
        <div class="years" aria-label="2008 to 2028"><span>2008</span><span class="line" aria-hidden="true"></span><span>2028</span></div>
        <div class="r-body mt-24">
          <p>The hallway conversations. The music. The people who made school feel like ours.</p>
          <p>A night to reconnect, with room for everyone’s story.</p>
        </div>
      </div>
    </div>
    <div class="rib" aria-hidden="true"></div>
  </section>

  <section class="r-chapter" id="r-known" aria-labelledby="rKnownH">
    <div class="r-inner">
      <div class="r-label"><span class="n">03</span><span class="t">What we know and what comes next</span></div>
      <h2 class="r-h" id="rKnownH">What we know. <span class="accent">What’s still open.</span></h2>
      <div class="known-grid">
        <div class="board reveal">
          <h3>Established context</h3>
          <ul>${KNOWN.map(([k, s]) => `<li><span class="what">${esc(k)}<span class="src">${esc(s)}</span></span>${pill('Approved', 'Known')}</li>`).join('')}</ul>
        </div>
        <div class="board board-open reveal">
          <h3>Decisions still open</h3>
          <ul>${OPEN_REUNION.map((o) => `<li><span class="what">${esc(o)}</span>${pill('Pending')}</li>`).join('')}</ul>
          <div class="roster-stat">
            <span class="big">318</span>
            <p><strong>classmates on our starting list.</strong> We’re still checking it against the yearbook. Being on the list doesn’t mean you’ve been contacted or signed up, and personal details stay private.</p>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="r-chapter r-tight-top" id="r-decide" aria-labelledby="rDecideH">
    <div class="r-inner">
      <div class="r-label"><span class="n">04</span><span class="t">Before tickets: date, venue and budget</span></div>
      <h2 class="r-h" id="rDecideH">A complete estimate comes <span class="accent">before ticket prices</span></h2>
      <div class="known-grid">
        <div class="board reveal">
          <h3>The date and venue decision</h3>
          <ul>${DATE_VENUE.map(([d, n]) => `<li><span class="what">${esc(d)}<span class="src">Needed: ${esc(n.toLowerCase())}</span></span>${pill('Pending')}</li>`).join('')}</ul>
        </div>
        <div class="board reveal">
          <h3>The reunion budget</h3>
          <ul>${BUDGET.map(([t, d]) => `<li><span class="what">${esc(t)}<span class="src">${esc(d)}</span></span>${budgetPill(t)}</li>`).join('')}</ul>
        </div>
      </div>
      <p class="caption-note">Reunion deck v1, slides 6 and 7. Budget figures live in the organizer tools.</p>
    </div>
  </section>

  <section class="r-chapter" id="r-memories" aria-labelledby="rMemH">
    <div class="r-inner">
      <div class="r-label"><span class="n">05</span><span class="t">Once a Kiltie, always a Kiltie</span></div>
      <div class="mem-grid">
        <div class="reveal">
          <button type="button" class="collage-btn" data-art="mj-5" aria-label="Enlarge: ${esc(a5.title)}">
            <img src="${a5.src}" alt="${esc(a5.alt)}" width="960" height="1200" loading="lazy"><span class="zoom-hint" aria-hidden="true">Zoom ⤢</span>
          </button>
          <p class="caption-note">Illustration created for this project, not a yearbook page. Writing in the image is decorative.</p>
        </div>
        <div>
          <h2 class="r-h" id="rMemH">School memories beside the lives we’ve <span class="accent">built</span></h2>
          <div class="r-body">
            <p>Varsity character. A grown-up celebration.</p>
            <p>Stories and photos can become part of the celebration with permission. Nothing is shown without review, and you can withdraw yours at any time.</p>
          </div>
          <a class="btn" href="#/me">Share a memory (committee)</a>
          <div class="character reveal">
            <button type="button" data-art="mj-1" aria-label="Enlarge: ${esc(a1.title)}"><img src="${a1.src}" alt="${esc(a1.alt)}" loading="lazy"></button>
            <h3>The Kiltie</h3>
            <p>Our mascot, reimagined in four illustrations for the 20-year story.</p>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="r-chapter r-paper grain" id="r-program" aria-labelledby="rProgH">
    <div class="r-inner">
      <div class="r-label"><span class="n">06</span><span class="t">The proposed reunion experience</span></div>
      <h2 class="r-h" id="rProgH">A flexible program, <span class="accent">proposed</span></h2>
      <p class="r-lede">Shaped around the venue and budget. Four parts, nine moments from the planning tracker. Start times and owners stay blank until the venue and scope support them.</p>
      <ol class="program">
        ${PROGRAM_GROUPS.map(([g, d], gi) => `
        <li>
          <button type="button" class="seg-btn" aria-expanded="false" aria-controls="seg${gi}">
            <span class="sq">${String(gi + 1).padStart(2, '0')}</span><span class="nm">${esc(g)}</span>${pill('Proposed')}<span class="chev" aria-hidden="true">+</span>
          </button>
          <div class="seg-panel" id="seg${gi}" hidden>
            <p>${esc(d)}</p>
            <dl>
              <dt>Segments</dt><dd>${PROGRAM.filter(([, grp]) => grp[0] === g).map(([n]) => esc(n)).join(' · ')}</dd>
              <dt>Times &amp; owners</dt><dd>Pending</dd>
              <dt>Source</dt><dd>Reunion deck v1 slide 5 · Tracker v1 Program</dd>
            </dl>
          </div>
        </li>`).join('')}
      </ol>
      <p class="mt-18"><button type="button" class="linkbtn" id="expandAll">Expand all parts</button></p>
      <h3 class="r-sub">The details that make it ours</h3>
      <ul class="details-row">${DETAILS.map((d) => `<li class="reveal">${esc(d)}</li>`).join('')}</ul>
      <p class="caption-note">Ideas for committee review, subject to budget and permission.</p>
    </div>
  </section>

  <section class="r-chapter" id="r-people" aria-labelledby="rPeopleH">
    <div class="r-inner">
      <div class="r-label"><span class="n">07</span><span class="t">The people making it happen</span></div>
      <h2 class="r-h" id="rPeopleH">Planning <span class="accent">leads</span></h2>
      <div class="people-grid">
        ${PEOPLE.map(([n, r]) => `<div class="person reveal"><span class="mono" aria-hidden="true">${esc(n.split(' ').map((x) => x[0]).join(''))}</span><div><h3>${esc(n)}</h3><p>${esc(r)}</p></div></div>`).join('')}
      </div>
      <p class="caption-note">${esc(PEOPLE_NOTE)}</p>
    </div>
  </section>

  <section class="r-chapter r-tight-top" id="r-plan" aria-labelledby="rPlanH">
    <div class="r-inner">
      <div class="r-label"><span class="n">08</span><span class="t">The planning sequence</span></div>
      <h2 class="r-h" id="rPlanH">How we get <span class="accent">there</span></h2>
      <ol class="roadmap">
        ${ROADMAP.map(([s, w], i) => `
        <li class="${i === 0 ? 'current' : ''}">
          <span class="dot">${i + 1}</span>
          <div><h4>${esc(s)}</h4><p>${esc(w)}</p>${i === 0 ? pill('In progress', 'Now') : pill('Pending')}</div>
        </li>`).join('')}
      </ol>
    </div>
  </section>

  <section class="r-chapter" id="r-help" aria-labelledby="rHelpH">
    <div class="r-inner">
      <div class="r-label"><span class="n">09</span><span class="t">Classmates can choose how to take part</span></div>
      <h2 class="r-h" id="rHelpH">Bring Pleasant <span class="accent">back together</span></h2>
      <div class="contrib-grid">
        ${CONTRIB.map(([t, d, href, l]) => `<div class="contrib reveal"><h3>${esc(t)}</h3><p>${esc(d)}</p>${extLink(href, l)}</div>`).join('')}
      </div>
    </div>
  </section>

  <section class="r-chapter r-tight-top" id="r-next" aria-labelledby="rNextH">
    <div class="r-inner">
      <div class="r-label"><span class="n">10</span><span class="t">Back to Pleasant</span></div>
      <h2 class="r-h" id="rNextH">The next <span class="accent">decisions</span></h2>
      <div class="known-grid">
        <div class="board reveal">
          <h3>Decide next</h3>
          <ul>${NEXT_REUNION.map((d) => `<li><span class="what">${esc(d)}</span>${pill('Pending')}</li>`).join('')}</ul>
        </div>
        <div class="board board-pages reveal">
          <h3>The class pages</h3>
          <p>${esc(CLASS_PAGES)}</p>
          <p>${extLink(SOCIAL.facebook, 'Facebook Page')} · ${extLink(SOCIAL.instagram, '@mph_classof08')}</p>
        </div>
      </div>
    </div>
  </section>`;
}

export function renderReunion(main, mode) {
  if (mode === 'present') {
    return renderDeck(main, { theme: 'r', title: 'Back to Pleasant', slides: REUNION_SLIDES, listFor, exitHash: '#/reunion' });
  }
  setTitle('Back to Pleasant');
  main.innerHTML = `<div class="story reunion">${storyBar(mode)}${mode === 'text' ? textView() : storyView()}</div>`;
  $$('[data-view]', main).forEach((b) => b.addEventListener('click', () => { location.hash = b.dataset.view === 'text' ? '#/reunion/text' : '#/reunion'; }));
  $$('[data-art]', main).forEach((b) => b.addEventListener('click', () => {
    const items = ART.filter((a) => a.events.includes('Reunion'));
    openLightbox(items, Math.max(0, items.findIndex((a) => a.id === b.dataset.art)), b);
  }));
  const segs = () => $$('.seg-btn', main);
  segs().forEach((b) => b.addEventListener('click', () => {
    const open = b.getAttribute('aria-expanded') !== 'true';
    b.setAttribute('aria-expanded', String(open));
    $(`#${b.getAttribute('aria-controls')}`, main).hidden = !open;
  }));
  const ea = $('#expandAll', main);
  if (ea) ea.addEventListener('click', () => {
    const anyClosed = segs().some((b) => b.getAttribute('aria-expanded') !== 'true');
    segs().forEach((b) => { b.setAttribute('aria-expanded', String(anyClosed)); $(`#${b.getAttribute('aria-controls')}`, main).hidden = !anyClosed; });
    ea.textContent = anyClosed ? 'Collapse all parts' : 'Expand all parts';
  });
  observeReveals(main);
  return mode === 'text' ? null : chapterSpy(main, '.r-chapter');
}
