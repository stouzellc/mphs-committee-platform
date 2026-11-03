import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dataDir = process.env.MPHS_DATA_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
for (const f of ['store.json', 'demo-credentials.local.txt']) {
  const p = path.join(dataDir, f);
  if (fs.existsSync(p)) { fs.renameSync(p, `${p}.bak-${Date.now()}`); console.log(`Moved ${f} aside`); }
}
const photos = path.join(dataDir, 'photos');
if (fs.existsSync(photos)) { fs.renameSync(photos, `${photos}.bak-${Date.now()}`); console.log('Moved photos aside'); }
console.log('Demo data will be recreated on next start.');
