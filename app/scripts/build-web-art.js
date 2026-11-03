// Builds web-sized artwork into app/art-web/ (kept with the code, so hosts need no image tools).
// Source: the metadata-stripped copies in app/art/ (made from ../assets/ at server start). Originals are never modified.
// Uses macOS `sips`. On another OS, produce the same files with any image tool and rerun with --manifest-only.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ensureDerivatives } from '../server/art.js';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.resolve(appDir, '..', 'assets');
const stripped = path.join(appDir, 'art');
const out = path.join(appDir, 'art-web');
const PAINTINGS = ['mj-1', 'mj-2', 'mj-3', 'mj-4', 'mj-5', 'mj-6'];
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

ensureDerivatives(assets, stripped, [...PAINTINGS.map((p) => `${p}.png`), 'embedded-brand.png']);
fs.mkdirSync(out, { recursive: true });
const jobs = [
  ...PAINTINGS.flatMap((p) => [
    { src: `${p}.png`, file: `${p}-960.jpg`, args: ['-s', 'format', 'jpeg', '-s', 'formatOptions', '82', '--resampleWidth', '960'] },
    { src: `${p}.png`, file: `${p}-480.jpg`, args: ['-s', 'format', 'jpeg', '-s', 'formatOptions', '78', '--resampleWidth', '480'] },
  ]),
  { src: 'embedded-brand.png', file: 'seal-600.png', args: ['-s', 'format', 'png', '--resampleWidth', '600'] },
  { src: 'embedded-brand.png', file: 'seal-96.png', args: ['-s', 'format', 'png', '--resampleWidth', '96'] },
];
if (!process.argv.includes('--manifest-only')) {
  for (const j of jobs) {
    const r = spawnSync('sips', [...j.args, path.join(stripped, j.src), '--out', path.join(out, j.file)], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`sips failed for ${j.file}: ${r.stderr || r.error}`);
  }
}
const manifest = jobs.map((j) => {
  const original = j.src;
  return { file: j.file, from: `assets/${original}`, originalSha256: sha(path.join(assets, original)), sha256: sha(path.join(out, j.file)), bytes: fs.statSync(path.join(out, j.file)).size };
});
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
for (const m of manifest) console.log(`${m.file.padEnd(16)} ${(m.bytes / 1024).toFixed(0).padStart(5)} KB  from ${m.from}`);
