// Launch-settings check for the real (production) site. The server refuses to start when an error is found.
import { urlSslMode, WEAK_SSLMODES } from './store/ssl.js';

const loopback = (h) => !h || h === '127.0.0.1' || h === 'localhost' || h === '::1';
// Fails closed: the real site is assumed whenever it looks hosted (https address or listening beyond this machine),
// unless MPHS_ENV=development says otherwise.
export function isProduction(env) {
  if (env.NODE_ENV === 'production' || env.MPHS_ENV === 'production') return true;
  if (env.MPHS_ENV === 'development') return false;
  return /^https:\/\//.test(env.PUBLIC_BASE_URL || '') || !loopback(env.HOST);
}
// Demo accounts and fictional records only when explicitly asked for, or for the local JSON store on this machine.
export function demoEnabled(env) {
  if (env.MPHS_DEMO_FIXTURES === '1') return !isProduction(env);
  if (env.MPHS_DEMO_FIXTURES === '0') return false;
  return !env.DATABASE_URL && !isProduction(env);
}

export function settingsProblems(env) {
  const errors = [];
  const warnings = [];
  if (!env.DATABASE_URL) errors.push('DATABASE_URL is not set: the real site must use the managed Postgres database, not the local file store.');
  if (env.MPHS_DEMO_FIXTURES === '1') errors.push('MPHS_DEMO_FIXTURES is 1: demo accounts and fictional records must not be created on the real site.');
  if (env.COOKIE_SECURE !== '1') errors.push('COOKIE_SECURE must be 1: session cookies must only travel over HTTPS.');
  if (!/^https:\/\/[^/]+/.test(env.PUBLIC_BASE_URL || '')) errors.push('PUBLIC_BASE_URL must be the site\'s https:// address (it is used in invite links and sign-in redirects).');
  if (env.MPHS_PRIVATE_SITE === '0') errors.push('MPHS_PRIVATE_SITE is 0: the committee site must stay private.');
  if (env.DATABASE_SSL !== 'require' && env.DATABASE_SSL !== 'disable') errors.push('DATABASE_SSL must be "require" (or "disable" only if the database is on a private network with the app).');
  if (env.DATABASE_SSL === 'disable') warnings.push('DATABASE_SSL=disable: database traffic is not encrypted. Use this only on a private network.');
  const mode = urlSslMode(env.DATABASE_URL || '');
  if (env.DATABASE_SSL === 'require' && mode && WEAK_SSLMODES.includes(mode)) warnings.push(`DATABASE_URL contains sslmode=${mode}; it is ignored because DATABASE_SSL=require. Remove it to avoid confusion.`);
  if (env.DATABASE_SSL !== 'require' && WEAK_SSLMODES.includes(mode) && env.DATABASE_SSL !== 'disable') errors.push(`DATABASE_URL contains sslmode=${mode}, which can leave the connection unencrypted or unverified.`);
  const oidcVars = ['AUTH_PROVIDER_ISSUER', 'AUTH_PROVIDER_CLIENT_ID', 'AUTH_PROVIDER_CLIENT_SECRET'];
  const setOidc = oidcVars.filter((k) => env[k]);
  if (setOidc.length && setOidc.length < oidcVars.length) errors.push(`Provider sign-in is half configured: set all of ${oidcVars.join(', ')} or none.`);
  if (env.MPHS_ALLOW_PASSWORD_LOGIN === '1' && setOidc.length) warnings.push('MPHS_ALLOW_PASSWORD_LOGIN=1 with provider sign-in: passwords bypass the provider\'s protections.');
  if (!/^(0|[1-5])$/.test(env.TRUST_PROXY || '')) errors.push('TRUST_PROXY must be set: the number of proxies in front of the app (Render: 3, measured with /api/admin/client-address), or 0 only if visitors connect directly. Otherwise sign-in limits see every visitor as one address and 30 bad attempts lock everyone out.');
  if (!env.HOST || env.HOST === '127.0.0.1' || env.HOST === 'localhost') warnings.push('HOST is not set to 0.0.0.0: most hosts need the app to listen on all interfaces.');
  return { errors, warnings };
}

export async function dataProblems(store) {
  const errors = [];
  const warnings = [];
  const users = await store.listUsers();
  const demoUsers = users.filter((u) => u.demo);
  if (demoUsers.length) errors.push(`${demoUsers.length} demo account(s) exist in the database. The real site must start from an empty database.`);
  const demoPeople = (await store.list('people')).filter((p) => p.demo || /^DEMO-/.test(p.alumniId || ''));
  if (demoPeople.length) errors.push(`${demoPeople.length} fictional classmate record(s) exist in the database.`);
  for (const c of ['participation', 'cabins', 'ledger', 'sponsors', 'memories']) {
    const n = (await store.list(c)).filter((r) => r.demo).length;
    if (n) errors.push(`${n} fictional ${c} record(s) exist in the database.`);
  }
  if (typeof store.auditWritable === 'function' && (await store.auditWritable())) {
    warnings.push('The app\'s database account can change or delete the audit history. Create the restricted account (npm run db:app-role), run the app with it and MPHS_MIGRATIONS=skip.');
  }
  const admins = users.filter((u) => u.role === 'admin' && u.active !== false);
  if (!admins.length) warnings.push('No administrator exists yet. Run: npm run create-admin -- --email you@example.com --name "Your Name"');
  else if (!admins.some((u) => u.hash) && !(await Promise.all(admins.map((u) => store.activeInvite(u.id)))).some(Boolean)) {
    warnings.push('No administrator can sign in yet (no password set and no open invite link). Run npm run create-admin again for a new link.');
  }
  return { errors, warnings };
}

export function formatReport({ errors, warnings }) {
  return [
    ...errors.map((e) => `  ✖ ${e}`),
    ...warnings.map((w) => `  ! ${w}`),
  ].join('\n');
}
