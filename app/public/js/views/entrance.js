import { esc, observeReveals, setTitle } from '../ui.js';
import { req } from '../api.js';

export async function renderEntrance(main) {
  setTitle('');
  main.innerHTML = `
  <div class="entrance">
    <section class="ent-hero grain" aria-labelledby="entTitle">
      <div>
        <p class="kicker">Mount Pleasant High School · Providence</p>
        <h1 class="ent-title" id="entTitle"><span class="of">Class of</span><span class="yr">2008</span></h1>
        <p class="ent-lede">Twenty years on, two ways back: <em>a reunion at home</em> and <em>a voyage beyond the shore</em>.</p>
      </div>
      <figure class="ent-seal">
        <img src="/art/web/seal-600.png" width="600" height="600" alt="Circular 20th-year reunion seal for Mount Pleasant High School Class of 2008 with the MP monogram, a brick school building and the Kiltie mascot.">
      </figure>
      <a class="ent-scroll" href="#/reunion" aria-hidden="true" tabindex="-1">Choose your way back ↓</a>
    </section>

    <section class="doors" aria-label="Choose an experience">
      <a class="door door-reunion" href="#/reunion">
        <img src="/art/web/mj-6-960.jpg" alt="" width="960" height="1200" loading="lazy">
        <div class="door-body">
          <span class="door-num">01 · THE REUNION</span>
          <h2>Back to <span>Pleasant</span></h2>
          <p>A homecoming for the Class of 2008. Memories, people and a proposed night together.</p>
          <span class="go">Enter the reunion story <span class="arrow" aria-hidden="true">→</span></span>
        </div>
      </a>
      <a class="door door-cruise" href="#/cruise">
        <img src="/art/web/mj-3-960.jpg" alt="" width="960" height="1200" loading="lazy">
        <div class="door-body">
          <span class="door-num">02 · THE CRUISE CONCEPT</span>
          <h2><em>Pleasant,</em><br>Beyond the Shore</h2>
          <p>Time together away from home. How interest, quotes and cabins would work.</p>
          <span class="go">Explore the cruise concept <span class="arrow" aria-hidden="true">→</span></span>
        </div>
      </a>
    </section>

    <section class="standing" aria-labelledby="standingH">
      <div class="standing-inner">
        <div>
          <p class="kicker">Where planning stands</p>
          <h2 id="standingH">Approved direction. Logistics still open.</h2>
        </div>
        <div class="status-grid" id="statusGrid">
          <div class="status-cell"><span class="lbl">Creative directions</span><span class="val">Back to Pleasant · Beyond the Shore</span><span class="pill pill-approved">Approved</span></div>
          <div class="status-cell"><span class="lbl">Reunion date &amp; venue</span><span class="val">Not yet chosen</span><span class="pill pill-pending">Pending</span></div>
          <div class="status-cell"><span class="lbl">Cruise provider &amp; sailing</span><span class="val">Not yet chosen</span><span class="pill pill-pending">Pending</span></div>
          <div class="status-cell"><span class="lbl">Tickets &amp; prices</span><span class="val">Not set</span><span class="pill pill-pending">Pending</span></div>
          <div class="status-cell"><span class="lbl">Reunion and cruise</span><span class="val">Companion or alternative?</span><span class="pill pill-pending">Pending</span></div>
          <div class="status-cell" id="openCount"><span class="lbl">Open decisions</span><span class="val">Loading…</span></div>
        </div>
        <p class="standing-note">No countdown until a date is approved. Confirmed details will appear here and on the class pages.</p>
      </div>
    </section>

    <section class="inside" aria-label="Also inside">
      <div class="inside-grid">
        <a class="tile tile-gallery reveal" href="#/gallery">
          <div class="tile-strip" aria-hidden="true">
            <img src="/art/web/mj-1-480.jpg" alt="" loading="lazy"><img src="/art/web/mj-2-480.jpg" alt="" loading="lazy"><img src="/art/web/mj-4-480.jpg" alt="" loading="lazy"><img src="/art/web/mj-5-480.jpg" alt="" loading="lazy">
          </div>
          <span class="num">03</span>
          <h3>Living memories gallery</h3>
          <p>Seven artworks: the Kiltie, the collage, the jacket and the seal. Zoom in.</p>
        </a>
        <a class="tile reveal" href="#/handbook">
          <span class="num">04</span>
          <h3>Committee handbook</h3>
          <p>How the class plans: decisions, money rules, privacy and message drafts.</p>
        </a>
        <a class="tile reveal" href="#/workspace">
          <span class="num">05</span>
          <h3>Organizer workspace</h3>
          <p>Decisions, tasks, budgets, sponsors and communications. Sign-in required.</p>
        </a>
      </div>
    </section>
  </div>`;
  observeReveals(main);
  const r = await req('GET', '/api/public/status');
  const cell = main.querySelector('#openCount');
  if (cell && r.ok) {
    cell.innerHTML = `<span class="lbl">Open decisions</span><span class="val">${esc(r.data.pendingTopics.length)} awaiting approval</span><span class="pill pill-pending">Tracked</span>`;
  } else if (cell) {
    cell.innerHTML = '<span class="lbl">Open decisions</span><span class="val">Unavailable offline</span>';
  }
}
