import { $, $$, esc, toast, setTitle } from '../ui.js';
import { req, has, currentUser } from '../api.js';

function highlight(root, q) {
  if (!q) return 0;
  const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) if (re.test(walker.currentNode.nodeValue)) nodes.push(walker.currentNode);
  let count = 0;
  for (const n of nodes) {
    const frag = document.createDocumentFragment();
    let last = 0;
    n.nodeValue.replace(re, (m, idx) => {
      frag.append(n.nodeValue.slice(last, idx));
      const mark = document.createElement('mark');
      mark.textContent = m;
      frag.append(mark);
      last = idx + m.length;
      count++;
      return m;
    });
    frag.append(n.nodeValue.slice(last));
    n.replaceWith(frag);
  }
  return count;
}

export async function renderHandbook(main, chapterId) {
  setTitle('Committee handbook');
  const hero = `
    <section class="hb-hero">
      <div class="hb-hero-inner">
        <div>
          <p class="kicker">MPHS Class of 2008 · Working copy from v1</p>
          <h1>Committee handbook</h1>
          <p>How the class plans: who decides, how money is counted, how classmates’ data is protected, and the message drafts we reuse.</p>
        </div>
        <img src="/art/web/seal-600.png" alt="" width="150" height="150">
      </div>
    </section>`;

  if (!has('planning')) {
    const o = await req('GET', '/api/public/handbook-outline');
    const chapters = o.ok ? o.data.chapters : [];
    main.innerHTML = `<div class="handbook">${hero}
      <div class="narrow">
        <div class="card">
          <h2 class="r-h">Organizers only</h2>
          <p>The handbook contains committee working rules. ${currentUser() ? 'Your account does not include organizer access.' : 'Sign in with an organizer account to read it.'}</p>
          ${currentUser() ? '' : '<a class="btn" href="#/login?next=handbook">Sign in</a>'}
          <h3 class="mt-24">Chapters</h3>
          <ol>${chapters.map((c) => `<li>${esc(c.title)}</li>`).join('')}</ol>
        </div>
      </div></div>`;
    return;
  }

  main.innerHTML = `<div class="handbook">${hero}<div class="hb-layout"><aside class="hb-side"><p class="muted">Loading…</p></aside><div class="hb-main"></div></div></div>`;
  const r = await req('GET', '/api/handbook');
  if (!r.ok) { $('.hb-main', main).innerHTML = `<div class="hb-empty">${esc(r.data.error || 'Could not load the handbook.')}</div>`; return; }
  const chapters = r.data.chapters;

  $('.hb-side', main).innerHTML = `
    <div class="hb-search"><label class="sr-only" for="hbq">Search the handbook</label><input id="hbq" type="search" placeholder="Search the handbook…" autocomplete="off"></div>
    <p class="sr-only" id="hbStatus" aria-live="polite"></p>
    <ol class="hb-toc">${chapters.map((c, i) => `<li><a href="#/handbook/${c.id}" data-id="${c.id}"><span class="n">${String(i + 1).padStart(2, '0')}</span><span>${esc(c.title)}<span class="hits" data-hits="${c.id}"></span></span></a></li>`).join('')}</ol>`;

  const links = $$('.hb-toc a', main);
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) links.forEach((l) => l.setAttribute('aria-current', String(`ch-${l.dataset.id}` === e.target.id)));
  }, { rootMargin: '-30% 0px -60% 0px' });

  const drawArticles = (q = '') => {
    io.disconnect();
    const main2 = $('.hb-main', main);
    main2.innerHTML = chapters.map((c, i) => `
      <article id="ch-${c.id}" aria-labelledby="h-${c.id}">
        <span class="chap-n">CHAPTER ${String(i + 1).padStart(2, '0')}</span>
        <h2 id="h-${c.id}" tabindex="-1">${esc(c.title)}</h2>
        <div class="hb-content">${c.html}</div>
        ${c.links.length ? `<div class="hb-links">${c.links.map(([l, v]) => `<a class="btn btn-sm btn-ghost" href="#/workspace/${v}">Open ${esc(l)} →</a>`).join('')}</div>` : ''}
      </article>`).join('') + '<div class="hb-empty" id="hbNone" hidden>No chapters match that search.</div>';
    let total = 0, shown = 0;
    for (const c of chapters) {
      const art = $(`#ch-${c.id}`, main2);
      const hits = highlight(art, q);
      total += hits;
      const match = !q || hits > 0;
      art.hidden = !match;
      if (match) shown++;
      $(`[data-hits="${c.id}"]`, main).textContent = q && hits ? ` ${hits}` : '';
    }
    $('#hbNone', main2).hidden = shown > 0;
    $('#hbStatus', main).textContent = q ? `${total} matches in ${shown} chapters` : '';
    $$('[data-template]', main2).forEach((t) => {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'btn btn-sm btn-ghost'; btn.textContent = 'Copy draft';
      btn.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText($('pre', t).textContent); toast('Draft copied. Nothing was posted.'); }
        catch { toast('Copy failed. Select the text manually.', true); }
      });
      $('.tpl-head', t).append(btn);
    });
    $$('.hb-main article:not([hidden])', main).forEach((a) => io.observe(a));
  };
  drawArticles();

  let timer;
  $('#hbq', main).addEventListener('input', (e) => { clearTimeout(timer); timer = setTimeout(() => drawArticles(e.target.value.trim()), 180); });

  links.forEach((l) => l.addEventListener('click', (e) => {
    e.preventDefault();
    history.replaceState(null, '', `#/handbook/${l.dataset.id}`);
    const t = $(`#ch-${l.dataset.id}`, main);
    t?.scrollIntoView({ behavior: 'smooth' });
    $(`#h-${l.dataset.id}`, main)?.focus({ preventScroll: true });
  }));
  if (chapterId) setTimeout(() => $(`#ch-${chapterId}`, main)?.scrollIntoView(), 50);
  return () => io.disconnect();
}
