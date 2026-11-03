// Starts a persistent local Postgres for development (data in app/.pgdata, port 5433). Ctrl-C to stop.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { startEmbeddedPostgres } from './embedded-pg.js';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(appDir, '.pgdata');
const secretFile = path.join(dir, '.local-password');
const port = Number(process.env.PGPORT_LOCAL || 5433);
fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
if (!fs.existsSync(secretFile)) fs.writeFileSync(secretFile, crypto.randomBytes(12).toString('hex'), { mode: 0o600 });
const password = fs.readFileSync(secretFile, 'utf8').trim();

const pg = await startEmbeddedPostgres({ databaseDir: path.join(dir, 'db'), port, password, persistent: true });
const c = pg.getPgClient();
await c.connect();
if (!(await c.query("SELECT 1 FROM pg_database WHERE datname = 'mphs'")).rowCount) await c.query('CREATE DATABASE mphs');
await c.end();

console.log(`Local Postgres running on 127.0.0.1:${port} (data: ${path.relative(process.cwd(), dir)})`);
console.log(`Start the app with: DATABASE_URL="postgres://postgres:$(cat ${path.relative(process.cwd(), secretFile)})@127.0.0.1:${port}/mphs" npm start`);
const stop = async () => { await pg.stop().catch(() => {}); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => {}, 1 << 30);
