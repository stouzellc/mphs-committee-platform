// Writes a full backup of the database (or the local JSON store) to a file readable only by you.
// Encrypted with BACKUP_PASSPHRASE (required unless --unencrypted is given for a local test).
// Usage: BACKUP_PASSPHRASE='…' npm run backup -- [--out path]
import '../server/env-file.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storeFromEnv } from '../server/store/index.js';
import { FORMAT, encryptBackup, summarize, passphraseFromEnv } from '../server/backup.js';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
const unencrypted = process.argv.includes('--unencrypted');
const pass = passphraseFromEnv(process.env);
if (!unencrypted && pass.length < 12) { console.error('Set BACKUP_PASSPHRASE_FILE (a file holding the passphrase) or BACKUP_PASSPHRASE, at least 12 characters. Use --unencrypted only for a local test.'); process.exit(2); }
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const out = path.resolve(arg('out') || path.join(appDir, 'backups', `mphs-backup-${stamp}${unencrypted ? '.json' : '.mphsbk'}`));
if (out.startsWith(path.join(appDir, 'public') + path.sep)) { console.error('Refusing to write a backup inside public/.'); process.exit(2); }

const dataDir = process.env.MPHS_DATA_DIR || path.join(appDir, 'data');
const store = storeFromEnv({ env: process.env, dataFile: path.join(dataDir, 'store.json'), initial: null });
try {
  await store.init();
  const data = { format: FORMAT, version: 1, createdAt: new Date().toISOString(), source: store.kind, ...(await store.exportAll()) };
  const bytes = unencrypted ? Buffer.from(JSON.stringify(data)) : encryptBackup(data, pass);
  fs.mkdirSync(path.dirname(out), { recursive: true, mode: 0o700 });
  // Never overwrite silently, and always end up readable only by this account.
  const force = process.argv.includes('--force');
  if (fs.existsSync(out) && !force) { console.error(`${out} already exists. Choose another --out or add --force.`); process.exitCode = 2; }
  else {
    fs.writeFileSync(out, bytes, { mode: 0o600, flag: force ? 'w' : 'wx' });
    fs.chmodSync(out, 0o600);
  }
  if (process.exitCode) throw Object.assign(new Error('not written'), { quiet: true });
  console.log(`Backup written: ${out} (${(bytes.length / 1024).toFixed(0)} KB, ${unencrypted ? 'NOT encrypted' : 'encrypted'})`);
  console.log(JSON.stringify(summarize(data)));
} catch (e) {
  if (!e.quiet) throw e;
} finally {
  await store.close().catch(() => {});
}
