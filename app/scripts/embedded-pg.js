// Local-only helper around the embedded-postgres dev dependency. Never used in production.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// npm may skip the platform package's postinstall (it recreates library symlinks the binaries need).
export function preparePostgresBinaries() {
  const pkgName = `@embedded-postgres/${process.platform}-${process.arch}`;
  const dir = path.join(appDir, 'node_modules', pkgName);
  if (!fs.existsSync(dir)) throw new Error(`${pkgName} is not installed. Run npm install in app/.`);
  const script = path.join(dir, 'scripts', 'hydrate-symlinks.js');
  if (fs.existsSync(script)) spawnSync(process.execPath, [script], { cwd: dir, stdio: 'ignore' });
}

export async function startEmbeddedPostgres({ databaseDir, port, password, persistent = false, quiet = true }) {
  preparePostgresBinaries();
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const pg = new EmbeddedPostgres({
    databaseDir, port, user: 'postgres', password, persistent,
    onLog: quiet ? () => {} : console.log, onError: quiet ? () => {} : console.error,
  });
  if (!fs.existsSync(path.join(databaseDir, 'PG_VERSION'))) await pg.initialise();
  await pg.start();
  return pg;
}

// Ensures the persistent local dev database (app/.pgdata, port 5433) is reachable, starting it if needed.
// Returns { url, stop } where stop() only stops a database this call started.
export async function ensureLocalPostgres({ port = Number(process.env.PGPORT_LOCAL || 5433) } = {}) {
  const [{ default: net }, { default: crypto }, { default: pg }] = await Promise.all([import('node:net'), import('node:crypto'), import('pg')]);
  const pgDir = path.join(appDir, '.pgdata');
  const secretFile = path.join(pgDir, '.local-password');
  fs.mkdirSync(pgDir, { recursive: true, mode: 0o700 });
  if (!fs.existsSync(secretFile)) fs.writeFileSync(secretFile, crypto.randomBytes(12).toString('hex'), { mode: 0o600 });
  const pw = fs.readFileSync(secretFile, 'utf8').trim();
  const portOpen = () => new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1', () => { s.end(); resolve(true); });
    s.on('error', () => resolve(false));
  });
  // A listening port is not enough: a previous run's Postgres may be shutting down. Require a working query.
  const usable = async () => {
    const c = new pg.Client({ connectionString: `postgres://postgres:${pw}@127.0.0.1:${port}/postgres`, connectionTimeoutMillis: 2000 });
    try { await c.connect(); await c.query('SELECT 1'); return true; } catch { return false; } finally { await c.end().catch(() => {}); }
  };
  let embedded = null;
  let reuse = false;
  if (await portOpen()) {
    reuse = await usable();
    if (!reuse) {
      console.log(`Port ${port} is busy but not usable yet (likely a previous run shutting down); waiting…`);
      for (let i = 0; i < 30 && (await portOpen()); i++) await new Promise((r) => setTimeout(r, 500));
      if (await portOpen()) {
        reuse = await usable();
        if (!reuse) throw new Error(`Port ${port} is held by something that is not the local MPHS database. Stop it or set PGPORT_LOCAL.`);
      }
    }
  }
  if (!reuse) {
    console.log(`Starting local Postgres on 127.0.0.1:${port} (data: app/.pgdata)…`);
    embedded = await startEmbeddedPostgres({ databaseDir: path.join(pgDir, 'db'), port, password: pw, persistent: true });
    const c = embedded.getPgClient();
    await c.connect();
    if (!(await c.query("SELECT 1 FROM pg_database WHERE datname = 'mphs'")).rowCount) await c.query('CREATE DATABASE mphs');
    await c.end();
  }
  return { url: `postgres://postgres:${pw}@127.0.0.1:${port}/mphs`, stop: () => (embedded ? embedded.stop().catch(() => {}) : Promise.resolve()) };
}
