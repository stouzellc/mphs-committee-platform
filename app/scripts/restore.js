// Restores a backup into an EMPTY database (or a new local JSON store), then verifies the counts.
// Usage: BACKUP_PASSPHRASE='…' npm run restore -- --in path/to/backup.mphsbk --yes
import '../server/env-file.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storeFromEnv } from '../server/store/index.js';
import { decryptBackup, summarize, passphraseFromEnv, isEncrypted } from '../server/backup.js';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
const file = arg('in');
if (!file || !process.argv.includes('--yes')) { console.error('Usage: npm run restore -- --in <backup file> --yes   (the target database must be empty)'); process.exit(2); }

const raw = fs.readFileSync(file);
if (!isEncrypted(raw)) console.warn('Warning: this backup is NOT encrypted. Delete unencrypted copies once restored.');
const backup = decryptBackup(raw, passphraseFromEnv(process.env));
const dataDir = process.env.MPHS_DATA_DIR || path.join(appDir, 'data');
const store = storeFromEnv({ env: process.env, dataFile: path.join(dataDir, 'store.json'), initial: null });
try {
  await store.init();
  if (!(await store.isEmpty())) { console.error('The target is not empty. Restore only into a new, empty database.'); process.exit(1); }
  await store.importAll(backup);
  const check = await store.exportAll();
  const want = summarize(backup);
  const got = summarize({ ...check, createdAt: backup.createdAt, source: backup.source });
  if (JSON.stringify(want.records) !== JSON.stringify(got.records) || want.users !== got.users || want.audit !== got.audit || want.photos !== got.photos) {
    console.error('Restore finished but the counts do not match the backup:', JSON.stringify({ want, got }));
    process.exit(1);
  }
  console.log(`Restored backup from ${backup.createdAt}: ${got.users} members, ${got.audit} audit entries, ${got.photos} photos, ${Object.values(got.records).reduce((a, b) => a + b, 0)} records. Counts verified.`);
} finally {
  await store.close().catch(() => {});
}
