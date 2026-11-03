import { $, $$, esc } from './ui.js';
import { loadSession, currentUser, logout, mode, isPrivate } from './api.js';
import { renderLogin, renderMe, renderInvite, renderAccount } from './views/member.js';

const main = $('#main');
let cleanup = null;

// Views load on demand: on a private site, signed-out visitors only ever download the sign-in code.
const view = (file, name) => async (...args) => (await import(`./views/${file}.js`))[name](...args);
const renderEntrance = view('entrance', 'renderEntrance');
const renderReunion = view('reunion', 'renderReunion');
const renderCruise = view('cruise', 'renderCruise');
const renderGallery = view('gallery', 'renderGallery');
const renderHandbook = view('handbook', 'renderHandbook');
const renderWorkspace = view('workspace', 'renderWorkspace');

const OPEN_WHEN_SIGNED_OUT = /^\/(login|invite\/[A-Za-z0-9_-]+)$/;

const routes = [
  [/^\/?$/, () => renderEntrance(main), ''],
  [/^\/reunion(?:\/(text|present))?$/, (m) => renderReunion(main, m[1]), 'reunion'],
  [/^\/cruise(?:\/(text|present))?$/, (m) => renderCruise(main, m[1]), 'cruise'],
  [/^\/gallery$/, () => renderGallery(main), 'gallery'],
  [/^\/handbook(?:\/([a-z0-9-]+))?$/, (m) => renderHandbook(main, m[1]), 'handbook'],
  [/^\/login$/, () => renderLogin(main), 'workspace'],
  [/^\/invite\/([A-Za-z0-9_-]+)$/, (m) => renderInvite(main, m[1]), ''],
  [/^\/account$/, () => renderAccount(main), ''],
  [/^\/me$/, () => renderMe(main), 'me'],
  [/^\/workspace(?:\/([a-z-]+))?$/, (m) => renderWorkspace(main, m[1] || 'overview'), 'workspace'],
];

async function route() {
  const path = (location.hash.replace(/^#/, '') || '/').split('?')[0];
  if (isPrivate() && !currentUser() && !OPEN_WHEN_SIGNED_OUT.test(path)) {
    const next = path.replace(/^\//, '');
    location.replace(`#/login${next && /^[a-z0-9/-]{1,60}$/.test(next) ? `?next=${encodeURIComponent(next)}` : ''}`);
    return;
  }
  if (typeof cleanup === 'function') { try { cleanup(); } catch { /* view already gone */ } }
  cleanup = null;
  document.body.className = '';
  $('#primaryNav').classList.remove('open');
  $('#navToggle').setAttribute('aria-expanded', 'false');
  let found = false;
  for (const [re, fn, nav] of routes) {
    const m = path.match(re);
    if (!m) continue;
    found = true;
    $$('#primaryNav a').forEach((a) => (a.dataset.nav === nav ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    main.innerHTML = '';
    try {
      cleanup = await fn(m);
    } catch {
      main.innerHTML = '<div class="narrow"><div class="card"><h1>Could not load this page</h1><p>Check your connection, or sign in again.</p><a class="btn" href="#/login">Sign in</a></div></div>';
    }
    break;
  }
  if (!found) {
    main.innerHTML = `<div class="narrow"><div class="card"><h1>Not found</h1><p>That page does not exist.</p><a class="btn" href="#/">Back to the entrance</a></div></div>`;
  }
  if (!path.startsWith('/workspace') || !sessionStorage.getItem('mphs-keep-scroll')) window.scrollTo(0, 0);
  sessionStorage.removeItem('mphs-keep-scroll');
  main.focus({ preventScroll: true });
}

function renderSession() {
  const u = currentUser();
  const el = $('#navSession');
  $('#demoRibbon').hidden = mode() !== 'local-demo';
  const locked = isPrivate() && !u;
  $$('#primaryNav > a').forEach((a) => { a.hidden = locked; });
  if (u) {
    el.innerHTML = `${u.permissions.includes('planning') ? '' : '<a href="#/me">My plans</a>'}<a href="#/account">${esc(u.displayName)}</a><button type="button" id="logoutBtn">Sign out</button>`;
    $('#logoutBtn').onclick = async () => { await logout(); location.hash = isPrivate() ? '#/login' : '#/'; };
  } else {
    el.innerHTML = '<a href="#/login">Sign in</a>';
  }
}

$('#navToggle').addEventListener('click', () => {
  const open = $('#primaryNav').classList.toggle('open');
  $('#navToggle').setAttribute('aria-expanded', String(open));
});
window.addEventListener('hashchange', route);
window.addEventListener('session-changed', () => {
  renderSession();
  if (isPrivate() && !currentUser()) route();
});

await loadSession();
renderSession();
route();
