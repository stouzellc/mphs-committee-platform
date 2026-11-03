// One place that decides how the database connection is encrypted, used by the app and every script.
// DATABASE_SSL=require: TLS with certificate checks, and any sslmode in DATABASE_URL is removed so it cannot
// weaken this. Optional DATABASE_CA_CERT points at the provider's CA certificate file.
import fs from 'node:fs';

export const WEAK_SSLMODES = ['disable', 'allow', 'prefer', 'no-verify'];

export function urlSslMode(url) {
  try { return new URL(url).searchParams.get('sslmode') || ''; } catch { return ''; }
}

// owner: true uses DATABASE_OWNER_URL when set (database updates and account setup run as the owner,
// while the app itself may run as the restricted account).
export function connectionFromEnv(env = process.env, { owner = false } = {}) {
  const url = (owner && env.DATABASE_OWNER_URL) || env.DATABASE_URL || '';
  if (env.DATABASE_SSL === 'require') {
    const u = new URL(url);
    for (const k of ['sslmode', 'ssl', 'sslcert', 'sslkey', 'sslrootcert', 'uselibpqcompat', 'channel_binding']) u.searchParams.delete(k);
    const ssl = { rejectUnauthorized: true };
    if (env.DATABASE_CA_CERT) ssl.ca = fs.readFileSync(env.DATABASE_CA_CERT, 'utf8');
    return { connectionString: u.toString(), ssl };
  }
  return { connectionString: url, ssl: undefined };
}
