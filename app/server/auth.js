import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Planning leads chose 7 days (25 Oct 2026). Signing out, a password change or deactivation ends a session early.
export const SESSION_HOURS = Math.min(Math.max(Number(process.env.MPHS_SESSION_HOURS) || 168, 1), 720);
export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// scrypt with parameters stored alongside the salt ("scrypt$N$r$p$salt"). Legacy salts (plain hex) used Node's
// defaults (N=16384) and are upgraded on the next successful sign-in. 64 MiB per hash: strong, but safe on a small host.
export const KDF = { N: 2 ** 16, r: 8, p: 1 };
const scrypt = (pw, salt, N, r, p) => new Promise((resolve, reject) =>
  crypto.scrypt(pw, salt, 64, { N, r, p, maxmem: 160 * 1024 * 1024 }, (e, k) => (e ? reject(e) : resolve(k))));

function parseSalt(stored) {
  const m = /^scrypt\$(\d+)\$(\d+)\$(\d+)\$([0-9a-f]+)$/.exec(stored || '');
  return m ? { N: Number(m[1]), r: Number(m[2]), p: Number(m[3]), salt: m[4] } : { N: 16384, r: 8, p: 1, salt: stored, legacy: true };
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = await scrypt(String(password), salt, KDF.N, KDF.r, KDF.p);
  return { salt: `scrypt$${KDF.N}$${KDF.r}$${KDF.p}$${salt}`, hash: key.toString('hex') };
}

let dummy = null;
// Always does one full hash, even for unknown accounts, so response time does not reveal who is a member.
export async function verifyPassword(password, user) {
  const usable = !!(user?.salt && user?.hash);
  if (!usable) dummy ||= await hashPassword(crypto.randomBytes(12).toString('hex'));
  const ref = usable ? user : dummy;
  const { N, r, p, salt, legacy } = parseSalt(ref.salt);
  const key = await scrypt(String(password).slice(0, 1024), salt, N, r, p);
  const b = Buffer.from(ref.hash, 'hex');
  const ok = key.length === b.length && crypto.timingSafeEqual(key, b) && usable;
  return { ok, needsRehash: ok && (legacy || N !== KDF.N || r !== KDF.r || p !== KDF.p) };
}

export const ROLE_PERMISSIONS = {
  classmate: ['self'],
  organizer: ['self', 'planning'],
  admin: ['self', 'planning', 'crm.view', 'crm.contact', 'crm.finance', 'memories.moderate', 'admin.users'],
};

export const ALL_PERMISSIONS = ['self', 'planning', 'crm.view', 'crm.contact', 'crm.finance', 'memories.moderate', 'admin.users'];

export function permissionsOf(user) {
  if (!user) return [];
  return [...new Set([...(ROLE_PERMISSIONS[user.role] || []), ...(user.extraPermissions || [])])];
}

export const DEMO_ACCOUNTS = [
  { id: 'u-classmate', username: 'classmate.demo', email: 'classmate.demo@example.invalid', displayName: 'Demo Classmate (Riley)', role: 'classmate', alumniId: 'DEMO-0002', extraPermissions: [] },
  { id: 'u-organizer', username: 'organizer.demo', email: 'organizer.demo@example.invalid', displayName: 'Demo Organizer', role: 'organizer', extraPermissions: ['crm.view', 'memories.moderate'] },
  { id: 'u-treasurer', username: 'treasurer.demo', email: 'treasurer.demo@example.invalid', displayName: 'Demo Treasurer', role: 'organizer', extraPermissions: ['crm.view', 'crm.finance'] },
  { id: 'u-admin', username: 'admin.demo', email: 'admin.demo@example.invalid', displayName: 'Demo Administrator', role: 'admin', extraPermissions: [] },
];

// Creates demo accounts with random passwords once, and writes them to a local file outside public/.
export async function ensureDemoUsers(store, credentialsFile) {
  if (await store.countUsers()) {
    // Older local demo data predates the email field.
    for (const acct of DEMO_ACCOUNTS) {
      const u = await store.getUser(acct.id);
      if (u && u.demo && !u.email) await store.updateUser(acct.id, { email: acct.email });
    }
    return false;
  }
  const lines = ['# Local demo accounts (fictional). Not for real data. Regenerated only when data is reset.', ''];
  for (const acct of DEMO_ACCOUNTS) {
    const password = crypto.randomBytes(9).toString('base64url');
    await store.createUser({ ...acct, ...(await hashPassword(password)), demo: true, active: true });
    lines.push(`${acct.username}  ${password}  (${acct.role})`);
  }
  if (credentialsFile) {
    fs.mkdirSync(path.dirname(credentialsFile), { recursive: true });
    fs.writeFileSync(credentialsFile, lines.join('\n') + '\n', { mode: 0o600 });
  }
  return true;
}

export async function createSession(store, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  await store.createSession(sha256(token), userId, Date.now() + SESSION_HOURS * 3600e3);
  return token;
}

export async function destroySession(store, token) {
  if (token) await store.deleteSession(sha256(token));
}

export async function userFromToken(store, token) {
  if (!token) return null;
  const s = await store.getSession(sha256(token));
  if (!s) return null;
  if (s.expires < Date.now()) { await store.deleteSession(sha256(token)); return null; }
  const u = await store.getUser(s.userId);
  return u && u.active !== false ? u : null;
}

export function publicUser(u) {
  if (!u) return null;
  return { id: u.id, username: u.username, email: u.email || '', displayName: u.displayName, role: u.role, permissions: permissionsOf(u), demo: !!u.demo, alumniId: u.alumniId || null };
}

// Sign-in attempt limits are kept in the store, so they hold across restarts and multiple app instances.
// Two limits: per address per account (10 / 10 min) and per address across all accounts (30 / 10 min).
// There is deliberately no address-independent per-account lock, so nobody can lock a member out from elsewhere.
export const LOCKOUT_ATTEMPTS = 10;
export const IP_ATTEMPTS = 30;
export const LOCKOUT_WINDOW_MS = 10 * 60e3;
// Behind N trusted proxies (TRUST_PROXY=N), the client address is the Nth X-Forwarded-For entry from the end,
// the one the outermost trusted proxy saw. Entries further left are client-supplied and ignored.
export function clientIp(req) {
  const hops = /^[1-5]$/.test(process.env.TRUST_PROXY || '') ? Number(process.env.TRUST_PROXY) : 0;
  const list = hops ? String(req.headers['x-forwarded-for'] || '').split(',').map((x) => x.trim()).filter(Boolean) : [];
  const fwd = hops && list.length >= hops ? list.at(-hops) : '';
  return String(fwd || req.socket.remoteAddress || 'local').replace(/^::ffff:/, '');
}
// subject: a user id when the account exists, otherwise the normalised identifier typed.
export const attemptKey = (ip, subject) => `${ip}:${String(subject || '').trim().toLowerCase()}`;
export const ipKey = (ip) => `${ip}:*`;
export async function rateLimited(store, key, ip) {
  const since = Date.now() - LOCKOUT_WINDOW_MS;
  if (ip && (await store.recentLoginFailures(ipKey(ip), since)) >= IP_ATTEMPTS) return true;
  return (await store.recentLoginFailures(key, since)) >= LOCKOUT_ATTEMPTS;
}
export async function recordFailure(store, key, ip) {
  await store.recordLoginFailure(key);
  if (ip) await store.recordLoginFailure(ipKey(ip));
}
export const clearFailures = (store, key) => store.clearLoginFailures(key);

export const INVITE_DAYS = 7;
export const newToken = () => crypto.randomBytes(32).toString('base64url');

// __Host- prefix (requires Secure, Path=/, no Domain) when the deployment is configured for HTTPS.
export const COOKIE_NAME = process.env.COOKIE_SECURE === '1' ? '__Host-mphs_session' : 'mphs_session';
