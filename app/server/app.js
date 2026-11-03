import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ConflictError, NotFoundError, ConstraintError } from './store/errors.js';
import { sourceRecords, demoRecords } from './seed.js';
import * as auth from './auth.js';
import { COLLECTIONS, SCHEMAS, can, redact, validate, writableFields } from './policy.js';
import { toCsv } from './csv.js';
import { HANDBOOK } from './handbook.js';
import { previewPeopleImport } from './import.js';
import { ensureDerivatives } from './art.js';
import { cleanPhoto, PHOTO_MAX_BYTES } from './photos.js';
import { createOidc, pkcePair, OidcError } from './oidc.js';
import { passwordProblem } from './passwords.js';
import * as fin from '../shared/finance.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(here, '..');
const PUBLIC = path.join(APP, 'public');
const SHARED = path.join(APP, 'shared');
const ASSETS = path.resolve(APP, '..', 'assets');
const ART_OUT = path.join(APP, 'art');
const ART_WEB = path.join(APP, 'art-web');

// Only these approved artworks are served (metadata-stripped derivatives of the originals).
export const ARTWORK = ['mj-1.png', 'mj-2.png', 'mj-3.png', 'mj-4.png', 'mj-5.png', 'mj-6.png', 'embedded-brand.png'];

const TYPES = { '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon' };

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; font-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};

export function initialData({ demo = true } = {}) {
  const src = sourceRecords();
  const d = demo ? demoRecords() : { people: [], participation: [], cabins: [], ledger: [], sponsors: [], memories: [] };
  return {
    schemaVersion: 1,
    mode: demo ? 'local-demo' : 'shared',
    collections: { ...src, sponsors: [...src.sponsors, ...d.sponsors], people: d.people, participation: d.participation, cabins: d.cabins, ledger: d.ledger, memories: d.memories },
    audit: [],
    users: [],
    sessions: {},
  };
}

const NEXT_RE = /^[a-z0-9/-]{0,60}$/;

// Private site, fail-closed: signed-out visitors get only these exact files (case-sensitive, after normalisation).
// Everything else under public/ needs a session. CSS files are open so the sign-in page is styled.
const PRIVATE_OPEN_FILES = new Set(['/index.html', '/favicon.svg', '/js/main.js', '/js/api.js', '/js/ui.js', '/js/views/member.js']);
const PRIVATE_OPEN_ART = new Set(['seal-96.png', 'seal-600.png']);

function listFiles(root, base = root) {
  const out = [];
  for (const e of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, e.name);
    if (e.isDirectory()) out.push(...listFiles(full, base));
    else if (e.isFile()) out.push(`/${path.relative(base, full).split(path.sep).join('/')}`);
  }
  return out;
}

export async function createApp({ store, credentialsFile, demo = true, log = () => {}, oidc: oidcConfig = null, allowPassword = true, privateSite = false, fetchImpl } = {}) {
  ensureDerivatives(ASSETS, ART_OUT, ARTWORK);
  await store.init();
  if (demo) await auth.ensureDemoUsers(store, credentialsFile);
  const mode = await store.mode();
  const oidc = oidcConfig ? createOidc({ ...oidcConfig, ...(fetchImpl ? { fetchImpl } : {}) }) : null;
  const passwordEnabled = allowPassword || !oidc;
  // Exact, case-sensitive inventory of servable files: requests are matched against it, never against the filesystem.
  const PUBLIC_FILES = new Set(listFiles(PUBLIC));
  // Web-sized artwork (app/art-web, built by scripts/build-web-art.js) and a staleness check against the originals.
  const webArt = new Map();
  try {
    for (const e of JSON.parse(fs.readFileSync(path.join(ART_WEB, 'manifest.json'), 'utf8'))) {
      if (fs.existsSync(path.join(ART_WEB, e.file))) webArt.set(e.file, e);
    }
    const shaOf = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
    const stale = [...new Set([...webArt.values()].map((e) => e.from))].filter((from) => {
      const f = path.resolve(APP, '..', from);
      return !fs.existsSync(f) || shaOf(f) !== [...webArt.values()].find((e) => e.from === from).originalSha256;
    });
    if (stale.length) log(`warning: web artwork is out of date for ${stale.join(', ')}; run npm run build:art`);
  } catch { log('warning: app/art-web is missing; run npm run build:art'); }

  const send = (res, status, body, headers = {}) => {
    const isStr = typeof body === 'string' || Buffer.isBuffer(body);
    res.writeHead(status, { ...SECURITY_HEADERS, ...(process.env.COOKIE_SECURE === '1' ? { 'Strict-Transport-Security': 'max-age=31536000' } : {}), 'Cache-Control': 'no-store', ...(isStr ? {} : { 'Content-Type': 'application/json; charset=utf-8' }), ...headers });
    res.end(isStr ? body : JSON.stringify(body));
  };
  const redirect = (res, location, headers = {}) => send(res, 302, '', { Location: location, ...headers });
  const cookie = (req, name) => {
    const m = (req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith(`${name}=`));
    return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
  };
  const readBody = (req) => new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > 200_000) { reject(Object.assign(new Error('Too large'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      let v;
      try { v = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}; } catch { return reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); }
      if (!v || typeof v !== 'object' || Array.isArray(v)) return reject(Object.assign(new Error('Request body must be a JSON object'), { status: 400 }));
      resolve(v);
    });
    req.on('error', reject);
  });

  // Raw request body (photo uploads), refused as soon as it passes the limit.
  const readRaw = (req, max) => new Promise((resolve, reject) => {
    if (Number(req.headers['content-length']) > max) { reject(Object.assign(new Error('Photos can be up to 5 MB.'), { status: 413 })); req.resume(); return; }
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > max) { reject(Object.assign(new Error('Photos can be up to 5 MB.'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
  // A memory photo is visible to the person who sent it, to reviewers, and to every member once a reviewer
  // approves it for the members' gallery.
  const inGallery = (m) => m.status === 'Approved' && m.showInGallery === true;
  const canSeePhoto = (user, m) => !!m?.photo && (m.submittedBy === user.id || can(user, 'memories.moderate') || inGallery(m));
  // Photo bytes and the memory record change together: one change at a time per memory, so a review and an upload
  // cannot interleave (single server process, as deployed).
  const memoryLocks = new Map();
  async function withMemoryLock(id, fn) {
    const prev = memoryLocks.get(id) || Promise.resolve();
    let release;
    const mine = prev.then(() => new Promise((r) => { release = r; }));
    memoryLocks.set(id, mine);
    await prev;
    try { return await fn(); } finally { release(); if (memoryLocks.get(id) === mine) memoryLocks.delete(id); }
  }
  const PHOTOS_PER_MEMBER = 40;
  const uploading = new Set();
  const photoMeta = (p) => ({ mime: p.mime, size: p.size, width: p.width, height: p.height, orientation: p.orientation });

  function serveFile(res, file, cache = 'no-cache') {
    fs.readFile(file, (err, buf) => {
      if (err) return send(res, 404, { error: 'Not found' });
      send(res, 200, buf, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': cache });
    });
  }

  const locked = (res) => send(res, 401, 'Sign in required.', { 'Content-Type': 'text/plain; charset=utf-8' });

  function staticRoute(req, res, url, user) {
    // One canonical path for both the access decision and the file lookup.
    const canonical = path.posix.normalize(url.pathname.replace(/\\/g, '/'));
    if (canonical === '/healthz') return send(res, 200, { ok: true });
    const webMatch = /^\/art\/web\/([^/]+)$/.exec(canonical);
    if (webMatch) {
      const name = webMatch[1];
      if (!webArt.has(name)) return send(res, 404, { error: 'Not found' });
      if (privateSite && !user && !PRIVATE_OPEN_ART.has(name)) return locked(res);
      return serveFile(res, path.join(ART_WEB, name), privateSite ? 'private, max-age=86400' : 'public, max-age=86400');
    }
    const artMatch = /^\/art\/([^/]+)$/.exec(canonical);
    if (artMatch) {
      const name = artMatch[1];
      if (!ARTWORK.includes(name)) return send(res, 404, { error: 'Not found' });
      if (privateSite && !user) return locked(res);
      return serveFile(res, path.join(ART_OUT, name), privateSite ? 'private, max-age=3600' : 'public, max-age=3600');
    }
    if (canonical === '/shared/finance.js') return serveFile(res, path.join(SHARED, 'finance.js'));
    const rel = canonical === '/' ? '/index.html' : canonical;
    // Anything that is not an exact known file gets the app shell (which is always open).
    if (!PUBLIC_FILES.has(rel)) return serveFile(res, path.join(PUBLIC, 'index.html'));
    if (privateSite && !user && !PRIVATE_OPEN_FILES.has(rel) && !/^\/css\/[^/]+\.css$/.test(rel) && !/^\/fonts\/[^/]+\.woff2$/.test(rel)) return locked(res);
    return serveFile(res, path.join(PUBLIC, ...rel.split('/').filter(Boolean)), rel.startsWith('/fonts/') ? 'public, max-age=31536000, immutable' : privateSite ? 'private, no-cache' : 'no-cache');
  }

  const secureCookie = (req) => process.env.COOKIE_SECURE === '1' || req.headers['x-forwarded-proto'] === 'https';
  // Lax so the session survives the redirect back from the sign-in provider; CSRF is blocked by the header + Origin check.
  const COOKIE = auth.COOKIE_NAME;
  const sessionCookie = (req, token) => `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${auth.SESSION_HOURS * 3600}${secureCookie(req) || COOKIE.startsWith('__Host-') ? '; Secure' : ''}`;
  const STATE_COOKIE = 'mphs_oidc_state';
  const stateCookie = (req, value, maxAge) => `${STATE_COOKIE}=${value}; HttpOnly; SameSite=Lax; Path=/api/auth/oidc; Max-Age=${maxAge}${secureCookie(req) || COOKIE.startsWith('__Host-') ? '; Secure' : ''}`;
  const clearCookie = (req) => `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secureCookie(req) || COOKIE.startsWith('__Host-') ? '; Secure' : ''}`;

  // Mutations require the custom header and, when present, a same-origin Origin.
  function csrfOk(req) {
    if (req.headers['x-mphs'] !== '1') return false;
    const origin = req.headers.origin;
    return !origin || origin === `http://${req.headers.host}` || origin === `https://${req.headers.host}`;
  }

  const summaries = async () => {
    const [budgetSettings, budgetLines, ledger, sponsors, decisions, tasks, cabins, participation] = await Promise.all(
      ['budgetSettings', 'budgetLines', 'ledger', 'sponsors', 'decisions', 'tasks', 'cabins', 'participation'].map((n) => store.list(n)),
    );
    const out = {};
    for (const ev of ['Reunion', 'Cruise']) {
      const set = budgetSettings.find((s) => s.id === ev);
      out[ev] = {
        budget: fin.budgetSummary(budgetLines.filter((l) => l.event === ev), set?.reserveRate),
        reserveStatus: set?.reserveStatus,
        sponsors: fin.sponsorSummary(sponsors, ev),
        openDecisions: decisions.filter((d) => (d.event === ev || d.event === 'Shared') && d.status === 'Pending').length,
        tasksOpen: tasks.filter((t) => (t.event === ev || t.event === 'Shared') && t.status !== 'Done').length,
        ledger: fin.ledgerSummary(ledger, { event: ev }),
      };
    }
    out.cabins = fin.cabinSummary(cabins, participation.filter((p) => p.event === 'Cruise' && p.status === 'Booked'));
    out.tasks = Object.fromEntries(['Not started', 'In progress', 'Blocked', 'Done'].map((s) => [s, tasks.filter((t) => t.status === s).length]));
    out.decisions = Object.fromEntries(['Pending', 'Proposed', 'Approved', 'Superseded', 'Rejected'].map((s) => [s, decisions.filter((d) => d.status === s).length]));
    return out;
  };

  const normKey = (v) => String(v || '').trim().toUpperCase();
  const DEMO_CAPABLE = ['people', 'participation', 'cabins', 'ledger', 'sponsors', 'quotes'];
  const DELETABLE = ['tasks', 'quotes', 'program', 'merch', 'comms', 'tickets'];
  const LEDGER_LOCKED = ['txnId', 'providerRef', 'alumniId', 'event', 'type', 'kind', 'amount', 'receivedBy', 'date'];
  const BALANCE_KINDS = ['Ticket', 'Deposit', 'Balance'];

  // Rules that depend on the whole record, checked after merging a patch. The database repeats the money rules.
  function recordRules(name, merged, before) {
    const errors = {};
    if (name === 'decisions' && merged.status === 'Approved') {
      for (const f of ['approver', 'date', 'evidence']) if (!merged[f]) errors[f] = 'Required before a decision can be Approved';
    }
    if (name === 'decisions' && merged.status === 'Superseded' && !merged.supersededBy) errors.supersededBy = 'Link the decision that replaces this one';
    if (name === 'memories' && before?.status === 'Withdrawn' && merged.status !== 'Withdrawn') errors.status = 'Withdrawn by the classmate; it cannot be re-approved';
    if (name === 'memories' && merged.status === 'Approved' && !merged.permission) errors.status = 'No permission recorded';
    if (name === 'ledger') {
      for (const f of ['event', 'type', 'kind', 'status', 'receivedBy']) if (!merged[f]) errors[f] = 'Required';
      if (typeof merged.amount !== 'number') errors.amount = 'Required';
      const voiding = merged.status === 'Void' && (!before || before.status !== 'Void');
      if (voiding && (!String(merged.note || '').trim() || (before && merged.note === before.note))) errors.note = 'Record the reason for voiding';
      if (before && before.status === 'Confirmed') {
        const locked = voiding ? LEDGER_LOCKED : [...LEDGER_LOCKED, 'note'];
        for (const f of locked) if (JSON.stringify(merged[f] ?? null) !== JSON.stringify(before[f] ?? null)) errors[f] = 'Confirmed transactions are locked. Void this one with a reason and record a new transaction.';
        if (!['Confirmed', 'Void'].includes(merged.status)) errors.status = 'A confirmed transaction can only be voided';
      }
      if (before && before.status === 'Void' && merged.status !== 'Void') errors.status = 'A voided transaction stays void';
    }
    return errors;
  }

  const userRow = async (u) => {
    const inv = await store.activeInvite(u.id);
    const signIn = u.hash ? (u.demo ? 'password (demo)' : 'password') : oidc ? 'provider' : 'no password yet';
    return { ...auth.publicUser(u), email: u.email || '', active: u.active !== false, extraPermissions: u.extraPermissions || [], signIn, passwordSet: !!u.hash, invite: inv ? { purpose: inv.purpose, expiresAt: new Date(inv.expires).toISOString() } : null };
  };
  // Look up by email first; usernames only apply to the fictional demo accounts.
  const findLogin = async (id) => (await store.findUserByEmail(id)) || (await (async () => { const u = await store.findUserByUsername(id); return u?.demo ? u : undefined; })());

  async function authRoutes(req, res, url, parts) {
    const method = req.method;
    if (parts[1] === 'config' && method === 'GET') {
      return send(res, 200, { password: passwordEnabled, oidc: !!oidc, providerLabel: oidcConfig?.label || 'your sign-in provider' });
    }
    if (parts[1] !== 'oidc' || !oidc) return send(res, 404, { error: 'Not found' });
    if (parts[2] === 'start' && method === 'GET') {
      const next = String(url.searchParams.get('next') || '');
      const state = crypto.randomBytes(24).toString('base64url');
      const nonce = crypto.randomBytes(24).toString('base64url');
      const { verifier, challenge } = pkcePair();
      await store.putAuthState(state, { nonce, verifier, next: NEXT_RE.test(next) ? next : '' }, Date.now() + 10 * 60e3);
      // Bind the sign-in to this browser: the callback must come back with the same state cookie.
      return redirect(res, await oidc.authorizationUrl({ state, nonce, codeChallenge: challenge }), { 'Set-Cookie': stateCookie(req, state, 600) });
    }
    if (parts[2] === 'callback' && method === 'GET') {
      const clear = stateCookie(req, '', 0);
      const fail = (reason) => { log(`oidc denied reason=${reason}`); return redirect(res, `/#/login?error=${reason}`, { 'Set-Cookie': clear }); };
      if (url.searchParams.get('error')) return fail('provider');
      const code = url.searchParams.get('code');
      const stateParam = url.searchParams.get('state') || '';
      const bound = cookie(req, STATE_COOKIE);
      if (!stateParam || !bound || bound.length !== stateParam.length || !crypto.timingSafeEqual(Buffer.from(bound), Buffer.from(stateParam))) return fail('state');
      const st = await store.takeAuthState(stateParam);
      if (!st || !code) return fail('state');
      let claims;
      try {
        const tokens = await oidc.exchangeCode(code, st.verifier);
        claims = await oidc.verifyIdToken(tokens.id_token, st.nonce);
      } catch (e) {
        if (e instanceof OidcError) return fail(e.reason === 'provider' ? 'provider' : 'token');
        throw e;
      }
      if (claims.email_verified !== true || !claims.email) return fail('unverified');
      const u = await store.findUserByEmail(claims.email);
      if (!u || u.active === false) {
        await store.audit({ userId: 'anonymous', action: 'login-denied', collection: 'users', id: '-', fields: ['reason:not-invited'] });
        return fail('not-invited');
      }
      const token = await auth.createSession(store, u.id);
      await store.audit({ userId: u.id, action: 'login', collection: 'users', id: u.id, fields: ['method:oidc'] });
      log(`login ok user=${u.id} method=oidc`);
      const dest = st.next || (auth.permissionsOf(u).includes('planning') ? 'workspace' : 'me');
      return redirect(res, `/#/${dest}`, { 'Set-Cookie': [sessionCookie(req, token), clear] });
    }
    return send(res, 404, { error: 'Not found' });
  }

  async function api(req, res, url, user) {
    const parts = url.pathname.split('/').filter(Boolean).slice(1);
    const method = req.method;

    if (parts[0] === 'session' && method === 'GET') return send(res, 200, { user: auth.publicUser(user), mode, private: privateSite });
    if (parts[0] === 'auth') return authRoutes(req, res, url, parts);

    if (parts[0] === 'login' && method === 'POST') {
      const body = await readBody(req);
      if (!passwordEnabled) return send(res, 403, { error: 'Password sign-in is disabled. Use the sign-in provider.' });
      const identifier = String(body.username || '').trim().toLowerCase().slice(0, 254);
      const ip = auth.clientIp(req);
      const found = identifier ? await findLogin(identifier) : undefined;
      // Keyed by account (not the typed alias), so email and username share one counter.
      const key = auth.attemptKey(ip, found ? found.id : `unknown:${identifier}`);
      if (await auth.rateLimited(store, key, ip)) return send(res, 429, { error: 'Too many attempts. Wait 10 minutes, or ask an administrator for a password reset link.' });
      const usable = found && found.active !== false ? found : null;
      const check = await auth.verifyPassword(String(body.password || ''), usable);
      if (!check.ok) {
        await auth.recordFailure(store, key, ip);
        return send(res, 401, { error: 'Email or password is incorrect.' });
      }
      const u = usable;
      if (check.needsRehash) await store.updateUser(u.id, await auth.hashPassword(String(body.password)));
      await auth.clearFailures(store, key);
      const token = await auth.createSession(store, u.id);
      log(`login ok user=${u.id}`);
      return send(res, 200, { user: auth.publicUser(u) }, { 'Set-Cookie': sessionCookie(req, token) });
    }
    if (parts[0] === 'logout' && method === 'POST') {
      await auth.destroySession(store, cookie(req, COOKIE));
      return send(res, 200, { ok: true }, { 'Set-Cookie': clearCookie(req) });
    }

    // One-time invite / reset links. Tokens arrive in the request body (never in URLs the server logs); only hashes are stored.
    if (parts[0] === 'invite' && method === 'POST' && (parts[1] === 'check' || parts[1] === 'accept')) {
      const body = await readBody(req);
      if (!passwordEnabled) return send(res, 403, { error: 'Password sign-in is turned off on this site.' });
      const hash = auth.sha256(String(body.token || ''));
      const gone = () => send(res, 404, { error: 'This link is invalid, has already been used, or has expired. Ask an administrator for a new one.' });
      const inv = body.token ? await store.getInvite(hash) : null;
      const target = inv ? await store.getUser(inv.userId) : null;
      if (!inv || !target || target.active === false) return gone();
      if (parts[1] === 'check') return send(res, 200, { displayName: target.displayName, email: target.email, purpose: inv.purpose, expiresAt: new Date(inv.expires).toISOString() });
      const problem = passwordProblem(body.password, target);
      if (problem) return send(res, 422, { errors: { password: problem } });
      if (body.confirm !== undefined && body.confirm !== body.password) return send(res, 422, { errors: { confirm: 'The two passwords do not match.' } });
      const used = await store.useInvite(hash);
      if (!used) return gone();
      await store.updateUser(target.id, await auth.hashPassword(body.password));
      await store.revokeInvites(target.id);
      await store.deleteUserSessions(target.id);
      await store.audit({ userId: target.id, action: used.purpose === 'reset' ? 'password-reset' : 'password-set', collection: 'users', id: target.id, fields: ['method:invite-link', `issued-by:${used.createdBy || 'unknown'}`] });
      const token = await auth.createSession(store, target.id);
      log(`password set user=${target.id}`);
      return send(res, 200, { user: auth.publicUser(target) }, { 'Set-Cookie': sessionCookie(req, token) });
    }

    if (privateSite && !user && parts[0] === 'public') return send(res, 401, { error: 'Sign in required.' });

    // Public, approved content only: aggregate planning status, no records about people.
    if (parts[0] === 'public' && parts[1] === 'status' && method === 'GET') {
      const [decisions, program] = await Promise.all([store.list('decisions'), store.list('program')]);
      return send(res, 200, {
        decisions: decisions.filter((d) => d.status === 'Approved').map(({ id, topic, text, date }) => ({ id, topic, text, date })),
        pendingTopics: decisions.filter((d) => d.status === 'Pending').map(({ id, event, topic }) => ({ id, event, topic })),
        program: program.filter((p) => p.event === 'Reunion' && p.status !== 'Cut').sort((a, b) => a.seq - b.seq).map(({ seq, segment, status }) => ({ seq, segment, status })),
      });
    }
    if (parts[0] === 'public' && parts[1] === 'handbook-outline' && method === 'GET') {
      return send(res, 200, { chapters: HANDBOOK.map(({ id, title }) => ({ id, title })) });
    }

    if (!user) return send(res, 401, { error: 'Sign in required.' });

    if (parts[0] === 'handbook' && method === 'GET') {
      if (!can(user, 'planning')) return send(res, 403, { error: 'The committee handbook is available to organizers.' });
      return send(res, 200, { chapters: HANDBOOK });
    }

    // Classmate self-service: only records linked to the signed-in member.
    if (parts[0] === 'me') {
      if (!can(user, 'self')) return send(res, 403, { error: 'Not permitted.' });
      const pub = (r) => ({ id: r.id, event: r.event, status: r.status, guests: r.guests, version: r.version });
      if (parts[1] === 'participation' && !parts[2] && method === 'GET') {
        const mine = (await store.list('participation')).filter((p) => user.alumniId && p.alumniId === user.alumniId).map(pub);
        return send(res, 200, { records: mine });
      }
      if (parts[1] === 'participation' && !parts[2] && method === 'POST') {
        const body = await readBody(req);
        const { errors, value } = validate('participation', { event: body.event, status: body.status, alumniId: user.alumniId || '' });
        if (!user.alumniId) errors.alumniId = 'Your account is not linked to an Alumni ID yet.';
        if (value?.status && !['Interested', 'Not interested', 'RSVP yes', 'Declined'].includes(value.status)) errors.status = 'Choose Interested, Not interested, RSVP yes or Declined';
        if ((await store.list('participation')).some((p) => p.alumniId === user.alumniId && p.event === value?.event)) errors.event = 'You already have a record for this event.';
        if (Object.keys(errors).length) return send(res, 422, { errors });
        const r = await store.insert('participation', { id: `PT-${crypto.randomUUID().slice(0, 8)}`, ...value, guests: 0, agreedTotal: null, cabinId: '' }, user.id);
        return send(res, 201, { record: pub(r) });
      }
      if (parts[1] === 'participation' && parts[2] && method === 'PATCH') {
        const rec = await store.get('participation', parts[2]);
        if (!rec || rec.alumniId !== user.alumniId) return send(res, 404, { error: 'Not found' });
        const body = await readBody(req);
        const allowed = ['Interested', 'Not interested', 'RSVP yes', 'Declined'];
        const patch = {};
        const errors = {};
        if ('status' in body) { if (!allowed.includes(body.status) || rec.status === 'Booked') errors.status = rec.status === 'Booked' ? 'Booked travel changes go through an organizer.' : `Choose one of: ${allowed.join(', ')}`; else patch.status = body.status; }
        if ('guests' in body) { const n = Number(body.guests); if (!Number.isInteger(n) || n < 0 || n > 4) errors.guests = 'Guests: 0 to 4'; else patch.guests = n; }
        for (const k of Object.keys(body)) if (!['status', 'guests', 'version'].includes(k)) errors[k] = 'Not editable here';
        if (Object.keys(errors).length) return send(res, 422, { errors });
        try {
          return send(res, 200, { record: pub(await store.update('participation', rec.id, patch, body.version, user.id)) });
        } catch (e) {
          if (e instanceof ConflictError) return send(res, 409, { error: 'This record changed since you opened it.', current: pub(e.current) });
          throw e;
        }
      }
      if (parts[1] === 'password' && method === 'POST') {
        const body = await readBody(req);
        if (!passwordEnabled) return send(res, 403, { error: 'Password sign-in is turned off on this site.' });
        const full = await store.getUser(user.id);
        // A first password is only set through an administrator's invite link, never from an existing session.
        if (!full.hash) return send(res, 403, { error: 'Ask an administrator for an invite link to set a password.' });
        const ip = auth.clientIp(req);
        const key = auth.attemptKey(ip, `pw:${user.id}`);
        if (await auth.rateLimited(store, key, ip)) return send(res, 429, { error: 'Too many attempts. Wait 10 minutes.' });
        if (!(await auth.verifyPassword(String(body.current || ''), full)).ok) {
          await auth.recordFailure(store, key, ip);
          return send(res, 422, { errors: { current: 'Your current password is not correct.' } });
        }
        const problem = passwordProblem(body.password, full);
        if (problem) return send(res, 422, { errors: { password: problem } });
        if (body.confirm !== undefined && body.confirm !== body.password) return send(res, 422, { errors: { confirm: 'The two passwords do not match.' } });
        await store.updateUser(user.id, await auth.hashPassword(body.password));
        await store.revokeInvites(user.id);
        await store.deleteUserSessions(user.id);
        await auth.clearFailures(store, key);
        await store.audit({ userId: user.id, action: 'password-change', collection: 'users', id: user.id, fields: ['method:self'] });
        const token = await auth.createSession(store, user.id);
        return send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, token) });
      }
      if (parts[1] === 'memories' && !parts[2] && method === 'GET') {
        return send(res, 200, { records: (await store.list('memories')).filter((m) => m.submittedBy === user.id) });
      }
      if (parts[1] === 'memories' && !parts[2] && method === 'POST') {
        const body = await readBody(req);
        const errors = {};
        const title = String(body.title || '').trim();
        const story = String(body.story || '').trim();
        if (!title || title.length > 120) errors.title = 'Title required, up to 120 characters';
        if (!story || story.length > 3000) errors.story = 'Story required, up to 3000 characters';
        if (body.permission !== true) errors.permission = 'Permission is required before organizers can review a submission';
        if (Object.keys(errors).length) return send(res, 422, { errors });
        const r = await store.insert('memories', { id: `MEM-${crypto.randomUUID().slice(0, 8)}`, title, story, submittedBy: user.id, permission: true, approvedUse: '', status: 'Submitted', demo: !!user.demo }, user.id);
        return send(res, 201, { record: r });
      }
      if (parts[1] === 'memories' && parts[2] && parts[3] === 'withdraw' && method === 'POST') {
        return withMemoryLock(parts[2], async () => {
          const m = await store.get('memories', parts[2]);
          if (!m || m.submittedBy !== user.id) return send(res, 404, { error: 'Not found' });
          // Withdrawing removes the photo for good.
          const r = await store.update('memories', m.id, { status: 'Withdrawn', ...(m.photo ? { photo: null } : {}) }, m.version, user.id);
          await store.deletePhoto(m.id);
          return send(res, 200, { record: r });
        });
      }
      if (parts[1] === 'memories' && parts[2] && parts[3] === 'photo' && (method === 'PUT' || method === 'DELETE')) {
        const owned = await store.get('memories', parts[2]);
        if (!owned || owned.submittedBy !== user.id) return send(res, 404, { error: 'Not found' });
        let photo = null;
        if (method === 'PUT') {
          // One upload at a time per member, and a cap per member, so uploads cannot exhaust memory or storage.
          if (uploading.has(user.id)) return send(res, 429, { errors: { photo: 'Another photo is still uploading. Try again in a moment.' } });
          const others = (await store.list('memories')).filter((x) => x.submittedBy === user.id && x.photo && x.id !== owned.id).length;
          if (others >= PHOTOS_PER_MEMBER) return send(res, 422, { errors: { photo: `Each member can share up to ${PHOTOS_PER_MEMBER} photos. Remove one first.` } });
          uploading.add(user.id);
          try { photo = cleanPhoto(await readRaw(req, PHOTO_MAX_BYTES)); } catch (e) {
            if (e.status === 413 || e.status === 422) return send(res, e.status, { errors: { photo: e.message } });
            throw e;
          } finally { uploading.delete(user.id); }
        }
        return withMemoryLock(owned.id, async () => {
          const m = await store.get('memories', owned.id);
          if (m.status !== 'Submitted') return send(res, 409, { errors: { photo: 'Photos can only be changed while the memory is waiting for review.' } });
          try {
            if (!photo) {
              const r = await store.update('memories', m.id, { photo: null }, m.version, user.id);
              await store.deletePhoto(m.id);
              return send(res, 200, { record: r });
            }
            await store.putPhoto(m.id, { mime: photo.mime, data: photo.data, sha256: photo.sha256, createdBy: user.id });
            const r = await store.update('memories', m.id, { photo: photoMeta(photo) }, m.version, user.id);
            await store.audit({ userId: user.id, action: 'photo-upload', collection: 'memories', id: m.id, fields: [`removed:${photo.removed.join('|') || 'none'}`, `bytes:${photo.size}`] });
            return send(res, 200, { record: r });
          } catch (e) {
            if (photo) { const cur = await store.get('memories', m.id); if (!cur?.photo) await store.deletePhoto(m.id); }
            if (e instanceof ConflictError) return send(res, 409, { error: 'This memory changed at the same time. Reload and try again.' });
            throw e;
          }
        });
      }
      return send(res, 404, { error: 'Not found' });
    }

    if (parts[0] === 'summary' && method === 'GET') {
      if (!can(user, 'planning')) return send(res, 403, { error: 'Not permitted.' });
      const s = await summaries();
      if (!can(user, 'crm.finance')) { delete s.Reunion.ledger; delete s.Cruise.ledger; }
      if (!can(user, 'crm.view')) delete s.cabins;
      return send(res, 200, s);
    }

    if (parts[0] === 'balances' && method === 'GET') {
      if (!can(user, 'crm.finance')) return send(res, 403, { error: 'Not permitted.' });
      const [participation, ledger] = await Promise.all([store.list('participation'), store.list('ledger')]);
      const rows = participation.map((p) => {
        const b = fin.personBalance(p.agreedTotal, ledger.filter((t) => t.alumniId === p.alumniId && t.event === p.event && BALANCE_KINDS.includes(t.kind)));
        return { id: p.id, alumniId: p.alumniId, event: p.event, participation: p.status, agreedTotal: p.agreedTotal, net: b.net, balance: b.balance, standing: b.status, depositRecord: b.depositRecord, heldForReview: b.heldForReview };
      });
      return send(res, 200, { rows });
    }

    // Admin-only: shows which visitor address the site sees, to confirm TRUST_PROXY on the hosted test copy.
    if (parts[0] === 'admin' && parts[1] === 'client-address' && method === 'GET') {
      if (!can(user, 'admin.users')) return send(res, 403, { error: 'Not permitted.' });
      return send(res, 200, { detected: auth.clientIp(req), forwardedFor: String(req.headers['x-forwarded-for'] || ''), socket: req.socket.remoteAddress || '', trustProxy: process.env.TRUST_PROXY || '(unset)' });
    }

    if (parts[0] === 'users') {
      if (!can(user, 'admin.users')) return send(res, 403, { error: 'Not permitted.' });
      if (method === 'GET' && !parts[1]) return send(res, 200, { users: await Promise.all((await store.listUsers()).map(userRow)), allPermissions: auth.ALL_PERMISSIONS, oidc: !!oidc });
      if (method === 'POST' && parts[1] && parts[2] === 'invite') {
        if (!passwordEnabled) return send(res, 403, { error: 'Password sign-in is turned off; members sign in with the provider.' });
        const target = await store.getUser(parts[1]);
        if (!target) return send(res, 404, { error: 'Not found' });
        if (target.active === false) return send(res, 422, { errors: { active: 'Reactivate this member before sending a link.' } });
        const purpose = target.hash ? 'reset' : 'invite';
        const token = auth.newToken();
        const expires = Date.now() + auth.INVITE_DAYS * 86400e3;
        await store.revokeInvites(target.id);
        await store.createInvite(auth.sha256(token), { userId: target.id, purpose, expires, createdBy: user.id });
        await store.audit({ userId: user.id, action: purpose === 'reset' ? 'reset-link' : 'invite-link', collection: 'users', id: target.id, fields: [`expires:${auth.INVITE_DAYS}d`] });
        return send(res, 201, { path: `/#/invite/${token}`, purpose, expiresAt: new Date(expires).toISOString() });
      }
      const body = method === 'GET' ? {} : await readBody(req);
      const errors = {};
      const email = 'email' in body ? String(body.email || '').trim().toLowerCase() : undefined;
      if (email !== undefined && email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email address';
      if ('role' in body && !Object.keys(auth.ROLE_PERMISSIONS).includes(body.role)) errors.role = 'Unknown role';
      if ('extraPermissions' in body && (!Array.isArray(body.extraPermissions) || body.extraPermissions.some((p) => !auth.ALL_PERMISSIONS.includes(p)))) errors.extraPermissions = 'Unknown permission';
      if ('active' in body && typeof body.active !== 'boolean') errors.active = 'Yes or no';
      if ('displayName' in body && (typeof body.displayName !== 'string' || !body.displayName.trim() || body.displayName.length > 80)) errors.displayName = 'Name required, up to 80 characters';
      if ('alumniId' in body && body.alumniId && !/^[A-Za-z0-9_-]{1,40}$/.test(body.alumniId)) errors.alumniId = 'Use letters, numbers, - or _';
      if (method === 'POST' && !parts[1]) {
        if (!email) errors.email = errors.email || 'Email is required; it must match the address the person signs in with';
        if (!body.displayName) errors.displayName = errors.displayName || 'Required';
        if (!body.role) errors.role = errors.role || 'Required';
        if (Object.keys(errors).length) return send(res, 422, { errors });
        if (await store.findUserByUsername(email)) return send(res, 409, { errors: { email: 'A member with this email already exists' } });
        try {
          const created = await store.createUser({
            id: `u-${crypto.randomUUID().slice(0, 8)}`, username: email, email, displayName: body.displayName.trim(), role: body.role,
            extraPermissions: body.extraPermissions || [], alumniId: body.alumniId || undefined, active: true, demo: false,
          });
          await store.audit({ userId: user.id, action: 'member-added', collection: 'users', id: created.id, fields: ['role', 'extraPermissions'] });
          return send(res, 201, { user: await userRow(created) });
        } catch (e) {
          if (e instanceof ConflictError) return send(res, 409, { errors: { email: 'A member with this email already exists' } });
          throw e;
        }
      }
      if (method === 'PATCH' && parts[1]) {
        const target = await store.getUser(parts[1]);
        if (!target) return send(res, 404, { error: 'Not found' });
        if (target.id === user.id && (body.active === false || (body.role && body.role !== 'admin'))) errors.role = 'You cannot remove your own administrator access.';
        if (Object.keys(errors).length) return send(res, 422, { errors });
        const patch = {};
        for (const k of ['role', 'extraPermissions', 'active', 'alumniId']) if (k in body) patch[k] = body[k];
        if ('displayName' in body) patch.displayName = body.displayName.trim();
        const emailChanged = email !== undefined && email !== (target.email || '');
        if (emailChanged) {
          const clash = (await store.findUserByUsername(email)) || (await store.findUserByEmail(email));
          if (clash && clash.id !== target.id) return send(res, 409, { errors: { email: 'Another member already uses this email' } });
          patch.email = email;
          if (!target.demo) patch.username = email;
        }
        try {
          const updated = await store.updateUser(target.id, patch);
          if (updated.active === false || emailChanged) {
            await store.deleteUserSessions(target.id);
            await store.revokeInvites(target.id);
          }
          await store.audit({ userId: user.id, action: 'access-change', collection: 'users', id: target.id, fields: Object.keys(patch) });
          return send(res, 200, { user: await userRow(updated) });
        } catch (e) {
          if (e instanceof ConflictError) return send(res, 409, { errors: { email: 'Another member already uses this email' } });
          throw e;
        }
      }
      return send(res, 405, { error: 'Method not allowed' });
    }

    if (parts[0] === 'import' && parts[1] === 'people' && method === 'POST') {
      if (!can(user, 'crm.contact')) return send(res, 403, { error: 'Not permitted.' });
      const body = await readBody(req);
      if (typeof body.csv !== 'string' || !body.csv.trim()) return send(res, 422, { errors: { csv: 'Paste or choose a CSV file' } });
      const label = String(body.sourceLabel || 'CSV import').slice(0, 120);
      if (body.mapping !== undefined && (typeof body.mapping !== 'object' || body.mapping === null || Array.isArray(body.mapping))) return send(res, 422, { errors: { mapping: 'Column choices must be an object' } });
      const preview = previewPeopleImport(body.csv, await store.list('people'), { sourceLabel: label, mapping: body.mapping || {}, expectedCount: body.expectedCount ?? null });
      if (preview.error) return send(res, 422, { errors: { csv: preview.error } });
      if (mode !== 'local-demo') {
        for (const r of preview.rows) if (/^DEMO-/i.test(String(r.record.alumniId || ''))) { r.errors.alumniId = 'IDs starting with DEMO- are reserved for fictional demo records'; preview.canApply = false; }
        preview.summary.invalid = preview.rows.filter((r) => Object.keys(r.errors).length).length;
      }
      if (parts[2] === 'preview') return send(res, 200, preview);
      if (parts[2] === 'apply') {
        if (body.confirm !== true) return send(res, 422, { errors: { confirm: 'Confirm that this import is approved' } });
        if (!preview.canApply) return send(res, 422, { error: 'Fix the reported rows before applying.', preview });
        // Rows are added one by one; a row someone else added in the meantime is skipped and reported, never overwritten.
        let added = 0, addedMeanwhile = 0;
        try {
          for (const r of preview.rows) {
            if (r.existing) continue;
            try { await store.insert('people', { ...r.record, demo: mode === 'local-demo' }, user.id); added++; } catch (e) { if (e instanceof ConflictError) addedMeanwhile++; else throw e; }
          }
        } finally {
          await store.audit({ userId: user.id, action: 'import', collection: 'people', id: `${added} added`, fields: [`source:${label}`, `rows:${preview.summary.total}`, `skipped-existing:${preview.summary.existing + addedMeanwhile}`, `warnings:${preview.summary.warnings}`] });
        }
        return send(res, 200, { added, skippedExisting: preview.summary.existing + addedMeanwhile });
      }
      return send(res, 404, { error: 'Not found' });
    }

    if (parts[0] === 'export' && method === 'GET') {
      const name = (parts[1] || '').replace(/\.csv$/, '');
      const rule = COLLECTIONS[name];
      if (!rule || !can(user, rule.read)) return send(res, 403, { error: 'Not permitted.' });
      const rows = (await store.list(name)).map((r) => redact(user, name, r));
      await store.audit({ userId: user.id, action: 'export', collection: name, id: '*' });
      return send(res, 200, toCsv(rows), { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="mphs-${name}.csv"` });
    }

    if (parts[0] === 'memories' && method === 'GET') {
      if (parts[1] === 'approved' && !parts[2]) {
        const approved = (await store.list('memories')).filter(inGallery);
        return send(res, 200, { records: approved.map((m) => ({ id: m.id, title: m.title, story: m.story, approvedUse: m.approvedUse || '', photo: m.photo ? photoMeta(m.photo) : null })) });
      }
      if (parts[1] && parts[2] === 'photo' && !parts[3]) {
        const m = await store.get('memories', decodeURIComponent(parts[1]));
        const p = canSeePhoto(user, m) ? await store.getPhoto(m.id) : null;
        if (!p) return send(res, 404, { error: 'Not found' });
        return send(res, 200, p.data, { 'Content-Type': p.mime, 'Cache-Control': 'private, no-store', 'Content-Disposition': 'inline', ETag: `"${p.sha256}"` });
      }
      return send(res, 404, { error: 'Not found' });
    }

    if (parts[0] === 'history' && method === 'GET') {
      const name = parts[1];
      const rule = COLLECTIONS[name];
      if (!rule || !can(user, rule.read)) return send(res, 403, { error: 'Not permitted.' });
      return send(res, 200, { history: (await store.history(name, parts[2])).slice(-200).reverse() });
    }

    if (parts[0] === 'c') {
      const name = parts[1];
      const rule = COLLECTIONS[name];
      if (!rule) return send(res, 404, { error: 'Not found' });
      const id = parts[2] ? decodeURIComponent(parts[2]) : null;
      if (method === 'GET') {
        if (!can(user, rule.read)) return send(res, 403, { error: 'Not permitted.' });
        if (id) { const r = await store.get(name, id); return r ? send(res, 200, { record: redact(user, name, r) }) : send(res, 404, { error: 'Not found' }); }
        return send(res, 200, { records: (await store.list(name)).map((r) => redact(user, name, r)) });
      }
      if (!can(user, rule.write)) return send(res, 403, { error: 'Not permitted.' });
      if (name === 'budgetSettings' && method !== 'PATCH') return send(res, 405, { error: 'Method not allowed' });
      if (name === 'memories' && method === 'POST') return send(res, 405, { error: 'Use the submission form.' });
      if (method === 'DELETE' && id) {
        if (name === 'ledger') return send(res, 405, { error: 'Ledger records are not deleted. Mark them Void and record a reason.' });
        if (!DELETABLE.includes(name)) return send(res, 405, { error: name === 'decisions' ? 'Decisions are not deleted. Mark them Superseded or Rejected.' : 'These records are not deleted from the workspace. Change their status instead.' });
      }
      const body = method === 'DELETE' ? {} : await readBody(req);
      try {
        if (method === 'POST') {
          const key = name === 'people' ? 'alumniId' : 'id';
          if (!body[key]) body[key] = `${name.slice(0, 3).toUpperCase()}-${crypto.randomUUID().slice(0, 8)}`;
          // The demo flag is set by the server only (fictional records exist only in local demo mode).
          delete body.demo;
          if (name === 'ledger') { body.txnId = normKey(body.txnId); body.providerRef = normKey(body.providerRef); body.id = body.txnId || body.id; }
          const { errors, value } = validate(name, body);
          for (const b of writableFields(user, name, value)) errors[b] = 'You do not have permission to set this field';
          Object.assign(errors, recordRules(name, value, null));
          if (mode !== 'local-demo' && /^DEMO-/i.test(String(value.alumniId || ''))) errors.alumniId = 'IDs starting with DEMO- are reserved for fictional demo records';
          if (DEMO_CAPABLE.includes(name)) value.demo = mode === 'local-demo';
          if (Object.keys(errors).length) return send(res, 422, { errors });
          if (name === 'ledger') {
            const dup = (await store.list('ledger')).find((t) => normKey(t.txnId) === value.txnId || (value.providerRef && normKey(t.providerRef) === value.providerRef));
            if (dup) { const f = normKey(dup.txnId) === value.txnId ? 'txnId' : 'providerRef'; return send(res, 409, { error: `Duplicate transaction: ${f === 'txnId' ? 'transaction ID' : 'provider reference'} already recorded.`, errors: { [f]: 'Already recorded' } }); }
          }
          if (name === 'people' && (await store.list('people')).some((x) => normKey(x.alumniId) === normKey(value.alumniId))) {
            return send(res, 409, { error: 'That Alumni ID already exists (IDs are compared without regard to capital letters).', errors: { alumniId: 'Already exists' } });
          }
          if (name === 'cabins' && (await store.list('cabins')).some((c) => normKey(c.cabinId) === normKey(value.cabinId))) {
            return send(res, 409, { error: 'That Cabin ID already exists.', errors: { cabinId: 'Already exists' } });
          }
          return send(res, 201, { record: redact(user, name, await store.insert(name, value, user.id)) });
        }
        if (method === 'PATCH' && id) {
          const { version, demo: _ignored, ...rest } = body;
          if (!Number.isInteger(version)) return send(res, 422, { errors: { version: 'Missing record version' } });
          const { errors, value } = validate(name, rest, { partial: true });
          delete value.id; delete value.alumniId;
          if (name === 'ledger') { if ('txnId' in value) value.txnId = normKey(value.txnId); if ('providerRef' in value) value.providerRef = normKey(value.providerRef); }
          for (const b of writableFields(user, name, value)) errors[b] = 'You do not have permission to change this field';
          if (name === 'ledger' && (('txnId' in value) || ('providerRef' in value))) {
            const dup = (await store.list('ledger')).find((t) => t.id !== id && ((value.txnId && normKey(t.txnId) === value.txnId) || (value.providerRef && normKey(t.providerRef) === value.providerRef)));
            if (dup) errors[normKey(dup.txnId) === value.txnId ? 'txnId' : 'providerRef'] = 'Already recorded on another transaction';
          }
          const patchRecord = async () => {
            const before = await store.get(name, id);
            if (!before) return send(res, 404, { error: 'Not found' });
            if (name === 'cabins' && 'cabinId' in value && (await store.list('cabins')).some((c) => c.id !== id && normKey(c.cabinId) === normKey(value.cabinId))) errors.cabinId = 'That Cabin ID already exists';
            Object.assign(errors, recordRules(name, { ...before, ...value }, before));
            if (Object.keys(errors).length) return send(res, 422, { errors });
            // A rejected or withdrawn memory loses its photo for good.
            const dropPhoto = name === 'memories' && before.photo && ['Rejected', 'Withdrawn'].includes(value.status);
            if (dropPhoto) value.photo = null;
            const r = await store.update(name, id, value, version, user.id);
            if (dropPhoto) await store.deletePhoto(id);
            if (name === 'ledger' && before.status !== r.status) {
              await store.audit({ userId: user.id, action: 'ledger-status', collection: 'ledger', id, fields: [`status ${before.status} -> ${r.status}`, `amount ${before.amount}`, `type ${before.type}`] });
            }
            return send(res, 200, { record: redact(user, name, r) });
          };
          return await (name === 'memories' ? withMemoryLock(id, patchRecord) : patchRecord());
        }
        if (method === 'DELETE' && id) {
          await store.remove(name, id, Number(url.searchParams.get('version')), user.id);
          return send(res, 200, { ok: true });
        }
      } catch (e) {
        if (e instanceof ConflictError) return send(res, 409, { error: 'Someone saved a newer version of this record.', current: redact(user, name, e.current) });
        if (e instanceof NotFoundError) return send(res, 404, { error: 'Not found' });
        if (e instanceof ConstraintError) return send(res, 409, { error: e.message, errors: { [e.field]: e.message } });
        throw e;
      }
      return send(res, 405, { error: 'Method not allowed' });
    }
    return send(res, 404, { error: 'Not found' });
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname.startsWith('/api/')) {
        if (req.method !== 'GET' && !csrfOk(req)) return send(res, 403, { error: 'Request blocked (missing same-origin header).' });
        const user = await auth.userFromToken(store, cookie(req, COOKIE));
        return await api(req, res, url, user);
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Method not allowed' });
      const user = privateSite ? await auth.userFromToken(store, cookie(req, COOKIE)) : null;
      return staticRoute(req, res, url, user);
    } catch (e) {
      if (e instanceof URIError) return send(res, 400, { error: 'Bad request' });
      log(`error ${req.method} ${url.pathname}: ${e.message}`);
      if (!res.headersSent) send(res, e.status || 500, { error: e.status ? e.message : 'Server error' });
    }
  }

  return { handle, store, SCHEMAS, close: () => store.close() };
}
