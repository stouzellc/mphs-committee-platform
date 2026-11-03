// Creates (or re-links) an administrator and prints a one-time link to set their password.
// This is how the first person gets into a real site that starts with no accounts.
// Usage: npm run create-admin -- --email you@example.com --name "Your Name"
import '../server/env-file.js';
import crypto from 'node:crypto';
import { storeFromEnv } from '../server/store/index.js';
import fs from 'node:fs';
import path from 'node:path';
import { sha256, newToken } from '../server/auth.js';

const LINK_HOURS = 24;

const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
const email = String(arg('email') || '').trim().toLowerCase();
const name = String(arg('name') || '').trim();
const base = String(process.env.PUBLIC_BASE_URL || 'http://127.0.0.1:4173').replace(/\/$/, '');
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name) {
  console.error('Usage: npm run create-admin -- --email you@example.com --name "Your Name"');
  process.exit(2);
}
const dataFile = path.join(process.env.MPHS_DATA_DIR || new URL('../data', import.meta.url).pathname, 'store.json');
if (!process.env.DATABASE_URL) {
  // The JSON store is rewritten by a running server, which would silently undo this change.
  if (!process.argv.includes('--force')) {
    console.error(`DATABASE_URL is not set, so this would edit the local JSON store (${dataFile}). Stop the server first, then rerun with --force.`);
    process.exit(2);
  }
}
const linkFile = arg('link-file');

const store = storeFromEnv({ env: process.env, dataFile, initial: null });
try {
  await store.init();
  let user = await store.findUserByEmail(email);
  if (user && user.active === false) {
    console.error(`${email} is deactivated. Reactivate them in the Access page (or ask another administrator) first.`);
    process.exit(1);
  }
  if (user && user.role !== 'admin') {
    console.error(`${email} already exists as ${user.role}. Change their role in the Access page instead.`);
    process.exit(1);
  }
  if (!user) {
    user = await store.createUser({ id: `u-${crypto.randomUUID().slice(0, 8)}`, username: email, email, displayName: name, role: 'admin', extraPermissions: [], active: true, demo: false });
    await store.audit({ userId: 'cli', action: 'member-added', collection: 'users', id: user.id, fields: ['role:admin', 'via:create-admin'] });
  }
  const token = newToken();
  await store.revokeInvites(user.id);
  await store.createInvite(sha256(token), { userId: user.id, purpose: user.hash ? 'reset' : 'invite', expires: Date.now() + LINK_HOURS * 3600e3, createdBy: 'cli' });
  await store.audit({ userId: 'cli', action: user.hash ? 'reset-link' : 'invite-link', collection: 'users', id: user.id, fields: [`expires:${LINK_HOURS}h`, 'via:create-admin'] });
  const link = `${base}/#/invite/${token}`;
  console.log(`Administrator: ${name} <${email}>`);
  if (linkFile) {
    // Keeps the admin-grade link out of hosted console logs.
    fs.writeFileSync(linkFile, `${link}\n`, { mode: 0o600, flag: 'wx' });
    console.log(`One-time link (valid ${LINK_HOURS} hours) written to ${linkFile}. Delete the file after use.`);
  } else {
    console.log(`One-time link (valid ${LINK_HOURS} hours, shown once). Hosted consoles may keep logs: prefer --link-file.`);
    console.log(link);
  }
} finally {
  await store.close().catch(() => {});
}
