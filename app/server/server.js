import './env-file.js';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp, initialData } from './app.js';
import { storeFromEnv } from './store/index.js';
import { isProduction, demoEnabled, settingsProblems, dataProblems, formatReport } from './launch-check.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;
const dataDir = env.MPHS_DATA_DIR || path.resolve(here, '..', 'data');
const port = Number(env.PORT || 4173);
const host = env.HOST || '127.0.0.1';
const demo = demoEnabled(env);
const privateSite = env.MPHS_PRIVATE_SITE !== '0';
// Logs carry user IDs and routes only, never record values.
const log = (m) => console.log(`[mphs] ${new Date().toISOString()} ${m}`);

const oidc = env.AUTH_PROVIDER_ISSUER ? {
  issuer: env.AUTH_PROVIDER_ISSUER,
  clientId: env.AUTH_PROVIDER_CLIENT_ID,
  clientSecret: env.AUTH_PROVIDER_CLIENT_SECRET,
  redirectUri: `${(env.PUBLIC_BASE_URL || `http://${host}:${port}`).replace(/\/$/, '')}${env.AUTH_REDIRECT_PATH || '/api/auth/oidc/callback'}`,
  label: env.AUTH_PROVIDER_LABEL,
} : null;

const production = isProduction(env);
if (production) {
  const r = settingsProblems(env);
  if (r.errors.length || r.warnings.length) console.log(`[mphs] launch check:\n${formatReport(r)}`);
  if (r.errors.length) { console.error('[mphs] refusing to start: fix the settings above (see RELEASE-CHECKLIST.md).'); process.exit(1); }
}

const store = storeFromEnv({ env, dataFile: path.join(dataDir, 'store.json'), initial: () => initialData({ demo }) });
const app = await createApp({
  store,
  credentialsFile: path.join(dataDir, store.kind === 'postgres' ? 'demo-credentials.postgres.local.txt' : 'demo-credentials.local.txt'),
  demo,
  log,
  oidc,
  allowPassword: !oidc || env.MPHS_ALLOW_PASSWORD_LOGIN === '1',
  privateSite,
});

if (production) {
  const d = await dataProblems(store);
  // After the first clean production start, stray records can no longer block a restart; they are reported instead.
  if (await store.getMeta('launched')) { d.warnings.push(...d.errors.map((e) => `(after launch) ${e}`)); d.errors = []; }
  if (d.errors.length || d.warnings.length) console.log(`[mphs] data check:\n${formatReport(d)}`);
  if (d.errors.length) { console.error('[mphs] refusing to start: the database is not ready for the real site.'); await app.close(); process.exit(1); }
  await store.setMeta('launched', new Date().toISOString());
}

const server = http.createServer(app.handle).listen(port, host, () => {
  log(`running at http://${host === '0.0.0.0' ? 'localhost' : host}:${port} (store: ${store.kind}, sign-in: ${oidc ? 'OIDC' : 'passwords'}, ${privateSite ? 'private site' : 'public pages open'})`);
  if (demo) log(`demo account passwords: ${path.join(dataDir, store.kind === 'postgres' ? 'demo-credentials.postgres.local.txt' : 'demo-credentials.local.txt')}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { server.close(); app.close().finally(() => process.exit(0)); });
}
