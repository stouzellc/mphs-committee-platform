// Runs the private committee site with personal passwords on the local Postgres (started if needed). No external accounts.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureLocalPostgres } from './embedded-pg.js';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = process.env.DATABASE_URL ? { url: process.env.DATABASE_URL, stop: async () => {} } : await ensureLocalPostgres();
const child = spawn(process.execPath, ['server/server.js'], { cwd: appDir, stdio: 'inherit', env: { MPHS_DEMO_FIXTURES: '1', MPHS_ENV: 'development', ...process.env, DATABASE_URL: db.url } });
const stop = () => { child.kill('SIGTERM'); db.stop().finally(() => process.exit(0)); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
child.on('exit', (c) => { db.stop().finally(() => process.exit(c ?? 0)); });
