// Runs the app with provider sign-in against the local mock provider (no real accounts).
// Uses DATABASE_URL if set (e.g. from `npm run db:local`), otherwise the local JSON store.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startMockOidc } from './mock-oidc.js';
import { ensureLocalPostgres } from './embedded-pg.js';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// --local-pg: use the local database from `npm run db:local`, starting it if it isn't running.
let localDb = null;
if (process.argv.includes('--local-pg') && !process.env.DATABASE_URL) {
  localDb = await ensureLocalPostgres();
  process.env.DATABASE_URL = localDb.url;
}
const stopDb = () => (localDb ? localDb.stop() : Promise.resolve());
const port = Number(process.env.PORT || 4173);
const base = `http://127.0.0.1:${port}`;
const mock = await startMockOidc({ port: Number(process.env.MOCK_OIDC_PORT || 4180), clientId: 'mphs-local', clientSecret: 'local-dev-only', redirectUris: [`${base}/api/auth/oidc/callback`] });
console.log(`Mock sign-in provider (local testing only): ${mock.issuer}`);

const child = spawn(process.execPath, ['server/server.js'], {
  cwd: appDir,
  stdio: 'inherit',
  env: {
    MPHS_DEMO_FIXTURES: '1',
    MPHS_ENV: 'development',
    ...process.env,
    PORT: String(port),
    PUBLIC_BASE_URL: base,
    AUTH_PROVIDER_ISSUER: mock.issuer,
    AUTH_PROVIDER_CLIENT_ID: mock.clientId,
    AUTH_PROVIDER_CLIENT_SECRET: mock.clientSecret,
    AUTH_PROVIDER_LABEL: 'the mock provider (local)',
  },
});
const stop = () => { child.kill('SIGTERM'); Promise.all([mock.close(), stopDb()]).finally(() => process.exit(0)); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
child.on('exit', (c) => { Promise.all([mock.close(), stopDb()]).finally(() => process.exit(c ?? 0)); });
