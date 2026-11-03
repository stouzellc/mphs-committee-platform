import { $, $$, esc, pill, toast, setTitle, memoryPhoto } from '../ui.js';
import { req, upload, login, currentUser, has, mode, isPrivate, setUser } from '../api.js';

const nextParam = () => new URLSearchParams(location.hash.split('?')[1] || '').get('next');

const LOGIN_ERRORS = {
  'not-invited': 'That email has not been invited. Ask a planning lead to add the exact address you sign in with.',
  unverified: 'Your sign-in provider has not verified that email address yet.',
  state: 'That sign-in link expired or was already used. Please start again.',
  token: 'The sign-in response could not be verified. Please try again.',
  provider: 'The sign-in provider returned an error or the sign-in was cancelled.',
};

export async function renderLogin(main) {
  setTitle('Sign in');
  const u = currentUser();
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const cfgRes = await req('GET', '/api/auth/config');
  const cfg = cfgRes.ok ? cfgRes.data : { password: true, oidc: false };
  const next = nextParam() || '';
  const errMsg = LOGIN_ERRORS[params.get('error')];
  main.innerHTML = `
  <div class="narrow">
    <div class="card">
      <h1>Sign in</h1>
      ${isPrivate() ? '<p class="muted">This is a private site for the MPHS Class of 2008 planning committee. Members get a personal invite link from a planning lead.</p>' : ''}
      ${u ? `<p class="notice">You are signed in as <strong>${esc(u.displayName)}</strong>. <a href="${has('planning') ? '#/workspace' : '#/me'}">Continue</a></p>` : ''}
      ${errMsg ? `<p class="notice notice-crimson" role="alert">${esc(errMsg)}</p>` : ''}
      ${cfg.oidc ? `<a class="btn btn-crimson" id="oidcBtn" href="/api/auth/oidc/start${/^[a-z0-9/-]{0,60}$/.test(next) && next ? `?next=${encodeURIComponent(next)}` : ''}">Continue with ${esc(cfg.providerLabel)}</a>
        <p class="muted mt-8">Invite-only: use the email address a planning lead added for you.</p>` : ''}
      ${cfg.password ? `
      ${mode() === 'local-demo' ? `<div class="notice notice-warn"><strong>Local demo accounts (fictional).</strong> Usernames: <code>classmate.demo</code>, <code>organizer.demo</code>, <code>treasurer.demo</code>, <code>admin.demo</code>. Passwords were generated when this server first started and are saved on this computer in the <code>app/data</code> folder (<code>demo-credentials…local.txt</code>). Do not enter real classmate data in demo mode.</div>` : ''}
      ${cfg.oidc ? '<h2 class="mt-24">Demo password sign-in</h2>' : ''}
      <form id="loginForm" novalidate>
        <div class="field"><label for="lu">Email</label><input id="lu" name="username" type="text" inputmode="email" autocomplete="username" required autocapitalize="none" spellcheck="false"><span class="hint">Demo accounts can also use their username.</span></div>
        <div class="field"><label for="lp">Password</label><input id="lp" name="password" type="password" autocomplete="current-password" required></div>
        <p class="field err" id="lerr" role="alert" hidden></p>
        <button class="btn" type="submit">Sign in</button>
      </form>` : ''}
      <p class="muted mt-18">You stay signed in on this device for 7 days, or until you sign out. There is no public sign-up. Forgot your password? Ask a planning lead for a new link.</p>
    </div>
  </div>`;
  const form = $('#loginForm', main);
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#lerr', main);
      const un = $('#lu', main).value.trim(), pw = $('#lp', main).value;
      if (!un || !pw) { err.hidden = false; err.textContent = 'Enter your email and password.'; return; }
      const btn = e.submitter; btn.disabled = true; btn.textContent = 'Signing in…';
      const r = await login(un, pw);
      btn.disabled = false; btn.textContent = 'Sign in';
      if (!r.ok) { err.hidden = false; err.textContent = r.data.error || 'Sign-in failed.'; $('#lp', main).select(); return; }
      toast(`Signed in as ${r.data.user.displayName}`);
      location.hash = next ? `#/${next}` : (r.data.user.permissions.includes('planning') ? '#/workspace' : '#/me');
    });
  }
  ($('#oidcBtn', main) || $('#lu', main))?.focus();
}

export async function renderMe(main) {
  setTitle('My plans');
  const u = currentUser();
  if (!u) { location.hash = '#/login?next=me'; return; }
  main.innerHTML = `
  <div class="member">
    <p class="kicker">Classmate area${u.demo ? ' · <span class="pill pill-demo">Demo account</span>' : ''}</p>
    <h1>Hello, ${esc(u.displayName)}</h1>
    <p class="muted">You can see and change only your own records here. Organizers cannot see your password.</p>
    <div class="member-grid" id="partGrid"></div>
    <section class="card mt-24" aria-labelledby="memH">
      <h2 class="r-h" id="memH">Your memories</h2>
      <div id="memList"></div>
      <form id="memForm" class="mt-24" novalidate>
        <h3>Share a memory</h3>
        <div class="field"><label for="mt">Title</label><input id="mt" maxlength="120" required><span class="err" data-err="title" hidden></span></div>
        <div class="field"><label for="ms">Your story</label><textarea id="ms" maxlength="3000" required></textarea><span class="hint">Do not include other people’s contact details.</span><span class="err" data-err="story" hidden></span></div>
        <label class="check"><input type="checkbox" id="mp"> <span>I give organizers permission to review this and, if approved, use it in reunion materials. I can withdraw it later.</span></label>
        <p class="field"><span class="err" data-err="permission" hidden></span></p>
        <div class="field"><label for="mph">Photo (optional)</label><input id="mph" type="file" accept="image/jpeg,image/png"><span class="hint">One JPEG or PNG, up to 5 MB. Location and camera details are removed before it is saved. Only reviewers see it unless they approve it for the members’ gallery.</span><span class="err" data-err="photo" hidden></span></div>
        <button class="btn" type="submit">Submit for review</button>
      </form>
    </section>
  </div>`;

  async function loadParticipation() {
    const r = await req('GET', '/api/me/participation');
    const grid = $('#partGrid', main);
    if (!r.ok) { grid.innerHTML = `<p class="notice notice-crimson">${esc(r.data.error)}</p>`; return; }
    const recs = r.data.records;
    grid.innerHTML = ['Reunion', 'Cruise'].map((ev) => {
      const rec = recs.find((x) => x.event === ev);
      const title = ev === 'Reunion' ? 'Back to Pleasant' : 'Pleasant, Beyond the Shore';
      if (!rec) return `
        <div class="card"><p class="kicker">${ev}</p><h2 class="r-h">${title}</h2>
          <p>No record yet. ${ev === 'Cruise' ? 'Registering interest is separate from a booking or payment.' : 'Let organizers know you would like to hear more.'}</p>
          ${u.alumniId ? `<button class="btn" data-create="${ev}">Register interest</button>` : '<p class="notice">Your account is not linked to a class record yet.</p>'}</div>`;
      const locked = rec.status === 'Booked';
      return `
        <form class="card" data-rec="${esc(rec.id)}" data-version="${rec.version}" novalidate>
          <p class="kicker">${ev} · ${pill(rec.status)}</p><h2 class="r-h">${title}</h2>
          ${locked ? '<p class="notice">Your booking is recorded. Changes go through an organizer.</p>' : `
          <div class="field"><label for="st-${ev}">Your status</label><select id="st-${ev}" name="status">${['Interested', 'Not interested', 'RSVP yes', 'Declined'].map((s) => `<option ${s === rec.status ? 'selected' : ''}>${s}</option>`).join('')}</select>${ev === 'Reunion' ? '<span class="hint">RSVP yes is not a ticket purchase. Ticketing is pending.</span>' : ''}<span class="err" data-err="status" hidden></span></div>
          <div class="field"><label for="g-${ev}">Guests you might bring</label><input id="g-${ev}" name="guests" type="number" min="0" max="4" value="${esc(rec.guests ?? 0)}"><span class="hint">Guest policy is pending.</span><span class="err" data-err="guests" hidden></span></div>
          <div class="conflict-slot"></div>
          <button class="btn" type="submit">Save</button> <span class="save-state" aria-live="polite">Saved · version ${rec.version}</span>`}
        </form>`;
    }).join('');
    $$('[data-create]', grid).forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true;
      const r2 = await req('POST', '/api/me/participation', { event: b.dataset.create, status: 'Interested' });
      if (r2.ok) { toast('Interest recorded. Nothing is booked.'); loadParticipation(); }
      else { b.disabled = false; toast(Object.values(r2.data.errors || {})[0] || r2.data.error, true); }
    }));
    $$('form[data-rec]', grid).forEach((f) => f.addEventListener('submit', async (e) => {
      e.preventDefault();
      $$('[data-err]', f).forEach((x) => { x.hidden = true; });
      const state = $('.save-state', f);
      state.className = 'save-state'; state.textContent = 'Saving…';
      const body = { status: f.status.value, guests: Number(f.guests.value), version: Number(f.dataset.version) };
      const r2 = await req('PATCH', `/api/me/participation/${encodeURIComponent(f.dataset.rec)}`, body);
      if (r2.ok) { f.dataset.version = r2.data.record.version; state.className = 'save-state ok'; state.textContent = `Saved · version ${r2.data.record.version}`; return; }
      state.className = 'save-state bad';
      if (r2.status === 409) {
        state.textContent = 'Not saved: changed elsewhere';
        $('.conflict-slot', f).innerHTML = `<div class="conflict" role="alert"><h3>This record changed since you opened it</h3><p>Latest saved status: <strong>${esc(r2.data.current.status)}</strong>, guests ${esc(r2.data.current.guests)}. Your changes were not saved.</p><div class="actions"><button type="button" class="btn btn-sm" data-reload>Load latest</button></div></div>`;
        $('[data-reload]', f).onclick = loadParticipation;
        return;
      }
      state.textContent = 'Not saved';
      for (const [k, v] of Object.entries(r2.data.errors || {})) { const el = $(`[data-err="${k}"]`, f); if (el) { el.hidden = false; el.textContent = v; } }
      if (!r2.data.errors) toast(r2.data.error, true);
    }));
  }

  async function loadMemories() {
    const r = await req('GET', '/api/me/memories');
    const list = $('#memList', main);
    if (!r.ok) { list.innerHTML = `<p class="notice notice-crimson">${esc(r.data.error)}</p>`; return; }
    const photoControls = (m) => (m.status !== 'Submitted' ? ''
      : m.photo ? ` · <button class="linkbtn" data-unphoto="${esc(m.id)}">Remove photo</button>`
        : ` · <label class="linkbtn file-link">Add a photo<input class="sr-only" type="file" accept="image/jpeg,image/png" data-addphoto="${esc(m.id)}"></label>`);
    list.innerHTML = r.data.records.length ? `<ul class="history mem-list">${r.data.records.map((m) => `<li${m.photo ? ' class="has-photo"' : ''}>${memoryPhoto(m)}<div><strong>${esc(m.title)}</strong> ${pill(m.status)}${m.demo ? ' <span class="pill pill-demo">Demo</span>' : ''}<span class="muted">${esc(m.story.slice(0, 140))}${m.story.length > 140 ? '…' : ''}</span>${m.status !== 'Withdrawn' ? `<span><button class="linkbtn" data-withdraw="${esc(m.id)}">Withdraw</button>${photoControls(m)}</span>` : ''}</div></li>`).join('')}</ul>`
      : '<div class="empty"><h3>No memories yet</h3><p>Your submissions will appear here with their review status.</p></div>';
    $$('[data-withdraw]', list).forEach((b) => b.addEventListener('click', async () => {
      const r2 = await req('POST', `/api/me/memories/${encodeURIComponent(b.dataset.withdraw)}/withdraw`, {});
      if (r2.ok) { toast('Withdrawn. Organizers will not use it, and any photo is deleted.'); loadMemories(); } else toast(r2.data.error, true);
    }));
    $$('[data-unphoto]', list).forEach((b) => b.addEventListener('click', async () => {
      const r2 = await req('DELETE', `/api/me/memories/${encodeURIComponent(b.dataset.unphoto)}/photo`);
      if (r2.ok) { toast('Photo removed and deleted.'); loadMemories(); } else toast(r2.data.error || Object.values(r2.data.errors || {})[0], true);
    }));
    $$('[data-addphoto]', list).forEach((inp) => inp.addEventListener('change', async () => {
      if (!inp.files[0]) return;
      const r2 = await upload(`/api/me/memories/${encodeURIComponent(inp.dataset.addphoto)}/photo`, inp.files[0]);
      if (r2.ok) { toast('Photo added. Reviewers will see it with your memory.'); loadMemories(); } else toast((r2.data.errors && r2.data.errors.photo) || r2.data.error, true);
    }));
  }

  $('#memForm', main).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    $$('[data-err]', f).forEach((x) => { x.hidden = true; });
    const file = $('#mph', f).files[0];
    if (file && file.size > 5 * 1024 * 1024) { const el = $('[data-err="photo"]', f); el.hidden = false; el.textContent = 'Photos can be up to 5 MB.'; return; }
    const r = await req('POST', '/api/me/memories', { title: $('#mt', f).value, story: $('#ms', f).value, permission: $('#mp', f).checked });
    if (r.ok) {
      f.reset();
      if (file) {
        const up = await upload(`/api/me/memories/${encodeURIComponent(r.data.record.id)}/photo`, file);
        if (!up.ok) { toast(`Memory submitted, but the photo was not saved: ${(up.data.errors && up.data.errors.photo) || up.data.error} You can add one from the list.`, true); loadMemories(); return; }
      }
      toast('Submitted for review. It is not published.'); loadMemories(); return;
    }
    for (const [k, v] of Object.entries(r.data.errors || {})) { const el = $(`[data-err="${k}"]`, f); if (el) { el.hidden = false; el.textContent = v; } }
    if (!r.data.errors) toast(r.data.error, true);
  });

  await Promise.all([loadParticipation(), loadMemories()]);
}

const PW_RULES = 'At least 12 characters. A short phrase of three or four unrelated words works well. Avoid your name, your email, and the school or class name.';

// Password managers need the account name next to a new password to save them together.
const usernameField = (email) => (email ? `<input class="sr-only" type="email" name="username" autocomplete="username" value="${esc(email)}" readonly tabindex="-1" aria-hidden="true">` : '');

function passwordFields(withCurrent, email = '') {
  return `
    ${usernameField(email)}
    ${withCurrent ? '<div class="field"><label for="pwCur">Current password</label><input id="pwCur" type="password" autocomplete="current-password"><span class="err" data-err="current" hidden></span></div>' : ''}
    <div class="field"><label for="pwNew">New password</label><input id="pwNew" type="password" autocomplete="new-password" minlength="12" aria-describedby="pwRules"><span class="hint" id="pwRules">${PW_RULES}</span><span class="err" data-err="password" hidden></span></div>
    <div class="field"><label for="pwConf">Type it again</label><input id="pwConf" type="password" autocomplete="new-password"><span class="err" data-err="confirm" hidden></span></div>
    <label class="check"><input type="checkbox" id="pwShow"> <span>Show passwords</span></label>`;
}

function wirePasswordForm(form, submit) {
  $('#pwShow', form).addEventListener('change', (e) => $$('input[type="password"], input[data-pw]', form).forEach((i) => { i.dataset.pw = '1'; i.type = e.target.checked ? 'text' : 'password'; }));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    $$('[data-err]', form).forEach((x) => { x.hidden = true; x.closest('.field')?.removeAttribute('data-invalid'); });
    const pw = $('#pwNew', form).value, conf = $('#pwConf', form).value;
    const show = (k, msg) => { const el = $(`[data-err="${k}"]`, form); if (el) { el.hidden = false; el.textContent = msg; el.closest('.field')?.setAttribute('data-invalid', ''); } };
    if (pw.length < 12) { show('password', 'Use at least 12 characters.'); $('#pwNew', form).focus(); return; }
    if (pw !== conf) { show('confirm', 'The two passwords do not match.'); $('#pwConf', form).focus(); return; }
    const btn = $('button[type="submit"]', form); btn.disabled = true;
    const r = await submit(pw, conf);
    btn.disabled = false;
    if (r.ok) return;
    for (const [k, v] of Object.entries(r.data.errors || {})) show(k, v);
    if (!r.data.errors) toast(r.data.error || 'Something went wrong.', true);
  });
}

export async function renderInvite(main, token) {
  setTitle('Set your password');
  main.innerHTML = '<div class="narrow"><div class="card"><p class="muted">Checking your link…</p></div></div>';
  // Keep the token for this tab only (so a refresh still works), then drop it from the address bar and history.
  const KEY = 'mphs-invite-token';
  const remember = (t) => { try { if (t) sessionStorage.setItem(KEY, t); else sessionStorage.removeItem(KEY); } catch { /* storage blocked: refresh will ask for the link again */ } };
  if (token !== 'link') remember(token);
  else { try { token = sessionStorage.getItem(KEY) || 'link'; } catch { /* storage blocked */ } }
  history.replaceState(null, '', '#/invite/link');
  const r = token === 'link' ? { ok: false, data: { error: 'Open the link from your invitation again.' } } : await req('POST', '/api/invite/check', { token });
  const card = $('.card', main);
  if (!r.ok) {
    remember(null);
    card.innerHTML = `<h1>Link not valid</h1><p>${esc(r.data.error)}</p><a class="btn" href="#/login">Go to sign in</a>`;
    return;
  }
  const { displayName, email, purpose, expiresAt } = r.data;
  card.innerHTML = `
    <p class="kicker">MPHS Class of 2008 · Planning committee</p>
    <h1>${purpose === 'reset' ? 'Choose a new password' : `Welcome, ${esc(displayName)}`}</h1>
    <p>You will sign in with <strong>${esc(email)}</strong>. This link works once and expires ${esc(new Date(expiresAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long' }))}.</p>
    <form id="pwForm" novalidate>${passwordFields(false, email)}<button class="btn mt-18" type="submit">${purpose === 'reset' ? 'Save new password' : 'Set password and sign in'}</button></form>`;
  wirePasswordForm($('#pwForm', card), async (password, confirm) => {
    const res = await req('POST', '/api/invite/accept', { token, password, confirm });
    if (res.status === 404) remember(null);
    if (res.ok) {
      remember(null);
      setUser(res.data.user);
      toast('Password saved. You are signed in.');
      location.hash = res.data.user.permissions.includes('planning') ? '#/workspace' : '#/me';
    }
    return res;
  });
  $('#pwNew', card).focus();
}

export async function renderAccount(main) {
  setTitle('Your account');
  const u = currentUser();
  if (!u) { location.hash = '#/login?next=account'; return; }
  main.innerHTML = `
  <div class="narrow">
    <div class="card">
      <p class="kicker">Your account${u.demo ? ' · <span class="pill pill-demo">Demo account</span>' : ''}</p>
      <h1>${esc(u.displayName)}</h1>
      <p class="muted">Role: ${esc(u.role)}. Changing your password signs you out everywhere else.</p>
      <h2 class="mt-24">Change password</h2>
      <form id="pwForm" novalidate>${passwordFields(true, u.email || '')}<button class="btn mt-18" type="submit">Change password</button></form>
    </div>
  </div>`;
  wirePasswordForm($('#pwForm', main), async (password, confirm) => {
    const res = await req('POST', '/api/me/password', { current: $('#pwCur', main).value, password, confirm });
    if (res.ok) { toast('Password changed. Other sessions were signed out.'); $('#pwForm', main).reset(); }
    return res;
  });
}
