// Memory photos: accept only real JPEG or PNG data, and rebuild each file from an allowlist of the parts an image
// needs, so camera location, device, time, comments, embedded thumbnails, private chunks and data appended after the
// image (such as motion-photo video) are never stored. The EXIF orientation is read first and kept as a number, so
// phone photos still display upright without EXIF.
// Limits: the compressed image data and the colour profile (kept for accurate colour on phone photos) are not decoded,
// so bytes hidden inside them cannot be detected; files are always served as image/* with nosniff under a strict CSP.
import crypto from 'node:crypto';
import zlib from 'node:zlib';

export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PHOTO_TYPES = ['image/jpeg', 'image/png'];
const MAX_SEGMENTS = 400; // real photos use a few dozen; this bounds the work and memory per upload

const bad = (msg) => Object.assign(new Error(msg), { status: 422 });
const damaged = () => bad('The image file is damaged or incomplete.');

function exifOrientation(seg) {
  // seg: APP1 payload starting with "Exif\0\0", then a TIFF header.
  const t = 6;
  if (seg.length < t + 8) return 1;
  const le = seg.toString('latin1', t, t + 2) === 'II';
  if (!le && seg.toString('latin1', t, t + 2) !== 'MM') return 1;
  const u16 = (o) => (o + 2 <= seg.length ? (le ? seg.readUInt16LE(o) : seg.readUInt16BE(o)) : 0);
  const u32 = (o) => (o + 4 <= seg.length ? (le ? seg.readUInt32LE(o) : seg.readUInt32BE(o)) : 0);
  const ifd = t + u32(t + 4);
  const n = u16(ifd);
  for (let i = 0; i < n; i++) {
    const e = ifd + 2 + i * 12;
    if (e + 12 > seg.length) break;
    if (u16(e) === 0x0112) { const v = u16(e + 8); return v >= 1 && v <= 8 ? v : 1; }
  }
  return 1;
}

const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
// Marker segments kept as they are: frame and scan headers, Huffman/arithmetic/quantization tables, restart interval.
const KEEP = new Set([...SOF, 0xc4, 0xcc, 0xdb, 0xdd, 0xda]);

export function cleanJpeg(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) throw bad('That file is not a JPEG image.');
  const parts = [buf.subarray(0, 2)];
  const removed = new Set();
  let orientation = 1, width = 0, height = 0, o = 2, segments = 0, sawExif = false, sawScan = false, sawTables = false, ended = false;
  while (o < buf.length) {
    if (++segments > MAX_SEGMENTS) throw bad('The image file has an unusual structure and was not accepted.');
    if (buf[o] !== 0xff) throw damaged();
    while (buf[o + 1] === 0xff) o++; // fill bytes
    const m = buf[o + 1];
    if (m === undefined) break;
    if (m === 0xd9) { ended = true; o += 2; break; }
    if (m >= 0xd0 && m <= 0xd7) { parts.push(buf.subarray(o, o + 2)); o += 2; continue; }
    if (m === 0x01) { removed.add('reserved marker'); o += 2; continue; }
    if (o + 4 > buf.length) throw damaged();
    const len = buf.readUInt16BE(o + 2);
    const end = o + 2 + len;
    if (len < 2 || end > buf.length) throw damaged();
    const seg = buf.subarray(o + 4, end);
    if (KEEP.has(m)) {
      parts.push(buf.subarray(o, end));
      if (m === 0xdb) sawTables = true;
      if (SOF.has(m)) { if (seg.length < 6) throw damaged(); height = seg.readUInt16BE(1); width = seg.readUInt16BE(3); }
    } else if (m === 0xe0 && seg.toString('latin1', 0, 5) === 'JFIF\0' && seg.length >= 14) {
      // JFIF header rebuilt from its fixed 14 bytes; any thumbnail or extra bytes after it are dropped.
      parts.push(Buffer.from([0xff, 0xe0, 0x00, 0x10]), seg.subarray(0, 5), seg.subarray(5, 12), Buffer.from([0, 0]));
      if (seg.length > 14) removed.add('JFIF thumbnail');
    } else if (m === 0xe2 && seg.toString('latin1', 0, 12) === 'ICC_PROFILE\0') {
      parts.push(buf.subarray(o, end)); // colour profile, needed for accurate colour on phone photos
    } else if (m === 0xee && seg.toString('latin1', 0, 5) === 'Adobe' && seg.length === 12) {
      parts.push(buf.subarray(o, end)); // colour transform flag for some encoders
    } else {
      if (m === 0xe1) {
        // Only the first EXIF block counts (the standard puts it first; later copies are ignored).
        if (!sawExif && seg.toString('latin1', 0, 6) === 'Exif\0\0') { orientation = exifOrientation(seg); sawExif = true; }
        removed.add('EXIF/XMP');
      } else if (m === 0xfe) removed.add('comment');
      else if (m >= 0xe0 && m <= 0xef) removed.add(`APP${m - 0xe0}`);
      else removed.add('other marker');
    }
    o = end;
    if (m === 0xda) {
      // Entropy-coded data runs until the next real marker (0xFF not followed by 0x00 or a restart marker).
      sawScan = true;
      let p = o;
      while (p + 1 < buf.length && !(buf[p] === 0xff && buf[p + 1] !== 0x00 && !(buf[p + 1] >= 0xd0 && buf[p + 1] <= 0xd7))) p++;
      parts.push(buf.subarray(o, p));
      o = p;
    }
  }
  if (!sawScan || !sawTables || !width || !height) throw damaged();
  parts.push(Buffer.from([0xff, 0xd9]));
  if (!ended || o < buf.length) removed.add('data after the image');
  return { data: Buffer.concat(parts), width, height, orientation, removed: [...removed] };
}

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// Critical chunks plus ancillary chunks that only affect how the pixels look. Text, time, EXIF and private chunks are dropped.
const PNG_KEEP = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'iCCP', 'sBIT', 'pHYs', 'bKGD']);

export function cleanPng(buf) {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIG)) throw bad('That file is not a PNG image.');
  const parts = [PNG_SIG];
  const removed = new Set();
  let o = 8, segments = 0, width = 0, height = 0, sawData = false, ended = false;
  while (o + 12 <= buf.length) {
    if (++segments > MAX_SEGMENTS) throw bad('The image file has an unusual structure and was not accepted.');
    const len = buf.readUInt32BE(o);
    const type = buf.toString('latin1', o + 4, o + 8);
    const end = o + 12 + len;
    if (end > buf.length || !/^[A-Za-z]{4}$/.test(type)) throw damaged();
    if (zlib.crc32(buf.subarray(o + 4, o + 8 + len)) !== buf.readUInt32BE(o + 8 + len)) throw damaged();
    if (segments === 1) {
      if (type !== 'IHDR' || len !== 13) throw damaged();
      width = buf.readUInt32BE(o + 8); height = buf.readUInt32BE(o + 12);
    }
    if (PNG_KEEP.has(type)) parts.push(buf.subarray(o, end)); else removed.add(type);
    if (type === 'IDAT') sawData = true;
    o = end;
    if (type === 'IEND') { ended = true; break; }
  }
  if (!ended || !sawData || !width || !height) throw damaged();
  if (o < buf.length) removed.add('data after the image');
  return { data: Buffer.concat(parts), width, height, orientation: 1, removed: [...removed] };
}

// The file's own bytes decide its type; the browser's Content-Type header is not trusted.
export function cleanPhoto(buf) {
  if (!buf.length) throw bad('Choose a photo to upload.');
  const tooBig = () => Object.assign(new Error('Photos can be up to 5 MB.'), { status: 413 });
  if (buf.length > PHOTO_MAX_BYTES) throw tooBig();
  const isPng = buf.subarray(0, 8).equals(PNG_SIG);
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (!isPng && !isJpeg) throw bad('Only JPEG and PNG photos can be uploaded. On iPhone, choose “Most Compatible” or share the photo as JPEG.');
  const r = isPng ? cleanPng(buf) : cleanJpeg(buf);
  if (r.data.length > PHOTO_MAX_BYTES) throw tooBig();
  return { ...r, mime: isPng ? 'image/png' : 'image/jpeg', size: r.data.length, sha256: crypto.createHash('sha256').update(r.data).digest('hex') };
}

// Restoring a backup re-checks every photo exactly like an upload: real JPEG/PNG only, cleaned again, and the
// checksum must match. A tampered backup cannot restore a script or other file as a "photo".
export function restoredPhotos(list = []) {
  return list.map((p) => {
    let c;
    try { c = cleanPhoto(Buffer.from(String(p.data || ''), 'base64')); } catch (e) { throw new Error(`Backup photo ${p.id} is not a valid image: ${e.message}`); }
    if (c.sha256 !== p.sha256) throw new Error(`Backup photo ${p.id} does not match its checksum.`);
    return { id: String(p.id), mime: c.mime, data: c.data, sha256: c.sha256, createdBy: String(p.createdBy || ''), createdAt: p.createdAt };
  });
}
