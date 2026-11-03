// Public artwork derivatives: identical image data, with text/EXIF/time metadata chunks removed
// (the originals carry author names and generation prompts). Originals in ../assets are never modified.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const DROP = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

export function stripPng(buf) {
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error('Not a PNG');
  const parts = [SIG];
  const dropped = [];
  let o = 8;
  while (o < buf.length) {
    const len = buf.readUInt32BE(o);
    const type = buf.toString('latin1', o + 4, o + 8);
    const end = o + 12 + len;
    if (DROP.has(type)) dropped.push(type); else parts.push(buf.subarray(o, end));
    o = end;
    if (type === 'IEND') break;
  }
  return { data: Buffer.concat(parts), dropped };
}

export function buildDerivatives(srcDir, outDir, names) {
  fs.mkdirSync(outDir, { recursive: true });
  const manifestPath = path.join(outDir, 'manifest.json');
  const manifest = [];
  for (const name of names) {
    const orig = fs.readFileSync(path.join(srcDir, name));
    const { data, dropped } = stripPng(orig);
    fs.writeFileSync(path.join(outDir, name), data);
    manifest.push({ file: name, original: `assets/${name}`, originalSha256: sha(orig), derivativeSha256: sha(data), removedChunks: [...new Set(dropped)] });
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return manifest;
}

export function ensureDerivatives(srcDir, outDir, names) {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf8'));
    const ok = names.every((n) => {
      const e = m.find((x) => x.file === n);
      return e && fs.existsSync(path.join(outDir, n)) && sha(fs.readFileSync(path.join(srcDir, n))) === e.originalSha256;
    });
    if (ok) return m;
  } catch { /* no manifest yet */ }
  return buildDerivatives(srcDir, outDir, names);
}
