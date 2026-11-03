// Runs the full test suite against a throwaway local Postgres (embedded binaries, random port, temp dir).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startEmbeddedPostgres } from './embedded-pg.js';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const freePort = () => new Promise((resolve) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); }); });

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mphs-pg-'));
const port = await freePort();
const password = crypto.randomBytes(12).toString('hex');
const pg = await startEmbeddedPostgres({ databaseDir: path.join(dir, 'db'), port, password });
let code = 1;
try {
  await pg.createDatabase('mphs_test');
  const url = `postgres://postgres:${password}@127.0.0.1:${port}/mphs_test`;
  const files = fs.readdirSync(path.join(appDir, 'tests')).filter((f) => f.endsWith('.test.js')).map((f) => path.join('tests', f));
  code = await new Promise((resolve) => {
    const child = spawn(process.execPath, ['--test', '--test-force-exit', '--test-timeout=60000', ...files], { cwd: appDir, stdio: 'inherit', env: { ...process.env, MPHS_TEST_DATABASE_URL: url } });
    child.on('exit', (c) => resolve(c ?? 1));
  });
} finally {
  await pg.stop().catch(() => {});
  fs.rmSync(dir, { recursive: true, force: true });
}
process.exit(code);
