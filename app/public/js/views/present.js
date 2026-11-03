import { $, $$, esc, setTitle } from '../ui.js';
import { art } from '../content.js';

// Full-screen presentation. Keys: ← → Space PageUp PageDown Home End, N notes, F fullscreen, Esc exit.
export function renderDeck(main, { theme, title, slides, listFor, exitHash }) {
  setTitle(`${title} · Presentation`);
  document.body.classList.add('present-mode');
  let i = Math.max(0, Math.min(slides.length - 1, Number(sessionStorage.getItem(`deck-${theme}`)) || 0));
  let notes = false;

  const slideHtml = (s, n) => {
    const a = s.art ? art(s.art) : null;
    const list = s.list ? listFor(s.list) : null;
    const listHtml = list ? `<ul class="s-list">${list.map(([l, r]) => `<li><span>${esc(l)}</span>${r || ''}</li>`).join('')}</ul>` : '';
    const text = `
      <div>
        <p class="s-k">${esc(s.k)}</p>
        <h2 class="s-h">${s.h}</h2>
        ${s.p ? `<p class="s-p">${esc(s.p)}</p>` : ''}
      </div>`;
    if (s.layout === 'list') return `<section class="slide slide-list" aria-roledescription="slide" aria-label="Slide ${n + 1} of ${slides.length}">${text}${listHtml}</section>`;
    if (s.layout === 'split' && a) {
      return `<section class="slide slide-split" aria-roledescription="slide" aria-label="Slide ${n + 1} of ${slides.length}">${text}<div class="art-wrap"><img class="art" src="${a.src}" alt="${esc(a.alt)}"></div></section>`;
    }
    return `<section class="slide slide-center" aria-roledescription="slide" aria-label="Slide ${n + 1} of ${slides.length}">${text}</section>`;
  };

  main.innerHTML = `
    <div class="deck deck-${theme}" role="region" aria-label="${esc(title)} presentation">
      <div class="deck-stage">
        <div class="deck-progress" aria-hidden="true"></div>
        ${slides.map(slideHtml).join('')}
        <aside class="notes" id="deckNotes" hidden aria-live="polite"><h3>Presenter notes</h3><p></p></aside>
      </div>
      <div class="deck-bar">
        <div class="grp">
          <a class="deck-btn" href="${exitHash}" aria-label="Exit presentation">Exit</a>
          <button type="button" class="deck-btn" id="dNotes" aria-pressed="false">Notes</button>
          <button type="button" class="deck-btn" id="dFull">Full screen</button>
        </div>
        <span class="keys-help">← → to move · N notes · F full screen · Esc exit</span>
        <div class="grp">
          <button type="button" class="deck-btn" id="dPrev" aria-label="Previous slide">←</button>
          <span class="ctr" id="dCtr" aria-live="polite"></span>
          <button type="button" class="deck-btn" id="dNext" aria-label="Next slide">→</button>
        </div>
      </div>
    </div>`;

  const els = $$('.slide', main);
  const show = () => {
    els.forEach((el, n) => {
      el.classList.toggle('active', n === i);
      el.classList.toggle('prev', n < i);
      el.setAttribute('aria-hidden', String(n !== i));
      el.inert = n !== i;
    });
    $('#dCtr', main).textContent = `${String(i + 1).padStart(2, '0')} / ${String(slides.length).padStart(2, '0')}`;
    $('.deck-progress', main).style.width = `${((i + 1) / slides.length) * 100}%`;
    $('#deckNotes p', main).textContent = slides[i].notes || 'No notes for this slide.';
    $('#dPrev', main).disabled = i === 0;
    $('#dNext', main).disabled = i === slides.length - 1;
    sessionStorage.setItem(`deck-${theme}`, String(i));
  };
  const go = (n) => { i = Math.max(0, Math.min(slides.length - 1, n)); show(); };
  const toggleNotes = () => { notes = !notes; $('#deckNotes', main).hidden = !notes; $('#dNotes', main).setAttribute('aria-pressed', String(notes)); };
  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  };
  $('#dPrev', main).onclick = () => go(i - 1);
  $('#dNext', main).onclick = () => go(i + 1);
  $('#dNotes', main).onclick = toggleNotes;
  $('#dFull', main).onclick = toggleFull;

  const onKey = (e) => {
    if (e.target.closest('input, textarea, select')) return;
    if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); go(i + 1); }
    else if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); go(i - 1); }
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(slides.length - 1);
    else if (e.key.toLowerCase() === 'n') toggleNotes();
    else if (e.key.toLowerCase() === 'f') toggleFull();
    else if (e.key === 'Escape' && !document.fullscreenElement) location.hash = exitHash;
  };
  let sx = null;
  const stage = $('.deck-stage', main);
  stage.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
  stage.addEventListener('touchend', (e) => { if (sx === null) return; const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 50) go(i + (dx < 0 ? 1 : -1)); sx = null; });
  document.addEventListener('keydown', onKey);
  show();
  $('#dNext', main).focus();
  return () => {
    document.removeEventListener('keydown', onKey);
    document.body.classList.remove('present-mode');
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  };
}

// Highlights the chapter link for the section in view.
export function chapterSpy(main, sectionSel) {
  const links = $$('.story-bar .chapters a', main);
  const sections = $$(sectionSel, main);
  if (!('IntersectionObserver' in window)) return () => {};
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) {
      links.forEach((l) => l.setAttribute('aria-current', String(l.dataset.target === e.target.id)));
      const active = links.find((l) => l.dataset.target === e.target.id);
      active?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, { rootMargin: '-45% 0px -50% 0px' });
  sections.forEach((s) => io.observe(s));
  links.forEach((l) => l.addEventListener('click', (ev) => {
    ev.preventDefault();
    const t = main.querySelector(`#${l.dataset.target}`);
    t?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    t?.querySelector('h1, h2')?.setAttribute('tabindex', '-1');
    setTimeout(() => t?.querySelector('h1, h2')?.focus({ preventScroll: true }), 400);
  }));
  return () => io.disconnect();
}
