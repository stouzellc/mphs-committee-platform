// Memory photos: metadata removal, who can see a photo, deletion on reject/withdraw, upload limits, backup.
// Test images are the project's own artwork derivative plus synthetic metadata; no real photos are used.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { createApp, initialData } from '../server/app.js';
import { createMemoryStore } from '../server/store/index.js';
import { cleanPhoto, PHOTO_MAX_BYTES, restoredPhotos } from '../server/photos.js';
import { makeStore, resetSchema, PG_URL, storeKind } from './helpers.js';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE_JPEG = fs.readFileSync(path.join(appDir, 'art-web', 'mj-1-480.jpg'));
const SECRETS = ['SECRET-GPS-41.82N', 'SECRET-COMMENT', 'SECRET-TRAILER', 'SECRET-PNG'];

// A JPEG carrying EXIF (orientation + a "location" string), a comment and data appended after the image.
function jpegWithMetadata(orientation = 6) {
  const text = Buffer.from('SECRET-GPS-41.82N\0', 'latin1');
  const tiff = Buffer.alloc(8 + 2 + 12 * 2 + 4);
  tiff.write('II', 0, 'latin1'); tiff.writeUInt16LE(42, 2); tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(2, 8);
  tiff.writeUInt16LE(0x010e, 10); tiff.writeUInt16LE(2, 12); tiff.writeUInt32LE(text.length, 14); tiff.writeUInt32LE(tiff.length, 18);
  tiff.writeUInt16LE(0x0112, 22); tiff.writeUInt16LE(3, 24); tiff.writeUInt32LE(1, 26); tiff.writeUInt16LE(orientation, 30);
  const exif = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff, text]);
  const seg = (marker, payload) => { const h = Buffer.alloc(4); h[0] = 0xff; h[1] = marker; h.writeUInt16BE(payload.length + 2, 2); return Buffer.concat([h, payload]); };
  return Buffer.concat([BASE_JPEG.subarray(0, 2), seg(0xe1, exif), seg(0xfe, Buffer.from('SECRET-COMMENT')), BASE_JPEG.subarray(2), Buffer.from('SECRET-TRAILER-motion-video')]);
}

function pngWithText() {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('tEXt', Buffer.from('Comment\0SECRET-PNG', 'latin1')),
    chunk('IDAT', zlib.deflateSync(Buffer.from([0, 200, 30, 40]))), chunk('IEND', Buffer.alloc(0))]);
}

const hasSecret = (buf) => SECRETS.some((s) => buf.toString('latin1').includes(s));

test('JPEG: location text, comment and appended data are removed; orientation is kept as a number', () => {
  const input = jpegWithMetadata(6);
  assert.ok(hasSecret(input), 'fixture carries the metadata');
  const out = cleanPhoto(input);
  assert.equal(out.mime, 'image/jpeg');
  assert.equal(out.orientation, 6);
  assert.ok(out.width > 0 && out.height > 0);
  assert.ok(!hasSecret(out.data), 'no metadata left in the saved file');
  assert.deepEqual([out.data[0], out.data[1]], [0xff, 0xd8]);
  assert.deepEqual([out.data.at(-2), out.data.at(-1)], [0xff, 0xd9]);
  assert.deepEqual(cleanPhoto(out.data).removed, [], 'the cleaned file is still a well-formed JPEG');
  assert.ok(out.removed.includes('EXIF/XMP') && out.removed.includes('comment') && out.removed.includes('data after the image'));
});

test('PNG: text chunks are removed', () => {
  const out = cleanPhoto(pngWithText());
  assert.equal(out.mime, 'image/png');
  assert.equal(out.width, 1);
  assert.ok(!hasSecret(out.data));
});

test('only real JPEG or PNG data is accepted, whatever the file claims to be', () => {
  assert.throws(() => cleanPhoto(Buffer.from('GIF89a....')), /Only JPEG and PNG/);
  assert.throws(() => cleanPhoto(Buffer.concat([Buffer.alloc(4), Buffer.from('ftypheic')])), /Only JPEG and PNG/);
  assert.throws(() => cleanPhoto(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')), /Only JPEG and PNG/);
  assert.throws(() => cleanPhoto(BASE_JPEG.subarray(0, 400)), /damaged/);
  assert.throws(() => cleanPhoto(Buffer.alloc(0)), /Choose a photo/);
  assert.throws(() => cleanPhoto(Buffer.alloc(PHOTO_MAX_BYTES + 1, 0xff)), /5 MB/);
});

// ---- Through the API ----
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mphs-photos-'));
const SCHEMA = 'photos_suite';
let server, base, app, creds;
const S = {};

async function call(method, url, { body, raw, cookie, headers = {} } = {}) {
  const h = { ...headers };
  if (cookie) h.Cookie = cookie;
  if (method !== 'GET' && !('X-MPHS' in h)) h['X-MPHS'] = '1';
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const res = await fetch(base + url, { method, headers: h, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
  const buf = Buffer.from(await res.arrayBuffer());
  let json = null;
  try { json = JSON.parse(buf.toString('utf8')); } catch { /* binary */ }
  return { status: res.status, json, buf, headers: res.headers };
}
const submit = async (title) => (await call('POST', '/api/me/memories', { cookie: S.classmate, body: { title, story: 'Fictional test story.', permission: true } })).json.record;
const putPhoto = (id, raw, cookie = S.classmate, headers = {}) => call('PUT', `/api/me/memories/${id}/photo`, { cookie, raw, headers: { 'Content-Type': 'image/jpeg', ...headers } });
const review = async (id, status, extra = {}) => {
  const cur = (await call('GET', `/api/c/memories/${id}`, { cookie: S.organizer })).json.record;
  return call('PATCH', `/api/c/memories/${id}`, { cookie: S.organizer, body: { status, ...extra, version: cur.version } });
};

before(async () => {
  if (PG_URL) await resetSchema(SCHEMA);
  app = await createApp({ store: makeStore({ file: path.join(dir, 'store.json'), schema: SCHEMA }), credentialsFile: path.join(dir, 'creds.txt'), log: () => {} });
  server = await new Promise((r) => { const s = http.createServer(app.handle).listen(0, '127.0.0.1', () => r(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
  creds = Object.fromEntries(fs.readFileSync(path.join(dir, 'creds.txt'), 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.trim().split(/\s+/).slice(0, 2)));
  for (const [k, u] of [['classmate', 'classmate.demo'], ['organizer', 'organizer.demo'], ['treasurer', 'treasurer.demo']]) {
    const r = await call('POST', '/api/login', { body: { username: u, password: creds[u] } });
    S[k] = r.headers.get('set-cookie').split(';')[0];
  }
});
after(async () => { await new Promise((r) => server.close(r)); await app.close(); fs.rmSync(dir, { recursive: true, force: true }); });

test(`upload → visible to sender and reviewers only → approved for the gallery → visible to members (${storeKind})`, async () => {
  const m = await submit('Photo memory');
  const up = await putPhoto(m.id, jpegWithMetadata(6));
  assert.equal(up.status, 200, JSON.stringify(up.json));
  assert.equal(up.json.record.photo.orientation, 6);
  assert.equal(up.json.record.photo.mime, 'image/jpeg');

  const own = await call('GET', `/api/memories/${m.id}/photo`, { cookie: S.classmate });
  assert.equal(own.status, 200);
  assert.equal(own.headers.get('content-type'), 'image/jpeg');
  assert.equal(own.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(!hasSecret(own.buf), 'served file has no metadata');
  assert.equal((await call('GET', `/api/memories/${m.id}/photo`, { cookie: S.organizer })).status, 200, 'reviewer can see it');
  assert.equal((await call('GET', `/api/memories/${m.id}/photo`, { cookie: S.treasurer })).status, 404, 'other members cannot before approval');
  assert.equal((await call('GET', `/api/memories/${m.id}/photo`)).status, 401, 'signed-out visitors cannot');
  assert.ok(!(await call('GET', '/api/memories/approved', { cookie: S.treasurer })).json.records.some((x) => x.id === m.id));

  assert.equal((await review(m.id, 'Approved')).status, 200);
  assert.equal((await call('GET', `/api/memories/${m.id}/photo`, { cookie: S.treasurer })).status, 404, 'approved for other uses only: still not shown to members');
  assert.ok(!(await call('GET', '/api/memories/approved', { cookie: S.treasurer })).json.records.some((x) => x.id === m.id));
  assert.equal((await review(m.id, 'Approved', { showInGallery: true })).status, 200);
  assert.equal((await call('GET', `/api/memories/${m.id}/photo`, { cookie: S.treasurer })).status, 200, 'members can see it once approved for the gallery');
  assert.equal((await call('GET', `/api/memories/${m.id}/photo`, { cookie: S.treasurer })).headers.get('cache-control'), 'private, no-store');
  const listed = (await call('GET', '/api/memories/approved', { cookie: S.treasurer })).json.records.find((x) => x.id === m.id);
  assert.equal(listed.photo.orientation, 6);
  assert.equal(listed.submittedBy, undefined, 'the shared list does not say who sent it');
  assert.equal((await putPhoto(m.id, jpegWithMetadata(1))).status, 409, 'photo cannot be swapped after review');
});

test('rejecting or withdrawing deletes the photo for good', async () => {
  const a = await submit('To be rejected');
  assert.equal((await putPhoto(a.id, pngWithText(), S.classmate, { 'Content-Type': 'image/png' })).status, 200);
  assert.ok(await app.store.getPhoto(a.id));
  const rej = await review(a.id, 'Rejected');
  assert.equal(rej.status, 200);
  assert.equal(rej.json.record.photo, null);
  assert.equal(await app.store.getPhoto(a.id), null);
  assert.equal((await call('GET', `/api/memories/${a.id}/photo`, { cookie: S.organizer })).status, 404);

  const b = await submit('To be withdrawn');
  assert.equal((await putPhoto(b.id, jpegWithMetadata())).status, 200);
  const w = await call('POST', `/api/me/memories/${b.id}/withdraw`, { cookie: S.classmate, body: {} });
  assert.equal(w.status, 200);
  assert.equal(w.json.record.photo, null);
  assert.equal(await app.store.getPhoto(b.id), null);

  const c = await submit('Photo removed by sender');
  assert.equal((await putPhoto(c.id, jpegWithMetadata())).status, 200);
  assert.equal((await call('DELETE', `/api/me/memories/${c.id}/photo`, { cookie: S.classmate })).json.record.photo, null);
  assert.equal(await app.store.getPhoto(c.id), null);
});

test('upload rules: owner only, same-site header, real images, size limit, reviewers cannot set the photo field', async () => {
  const m = await submit('Rules');
  assert.equal((await putPhoto(m.id, jpegWithMetadata(), S.organizer)).status, 404, 'only the sender can attach a photo');
  assert.equal((await putPhoto(m.id, jpegWithMetadata(), S.classmate, { 'X-MPHS': undefined })).status, 403, 'blocked without the same-site header');
  const bad = await putPhoto(m.id, Buffer.from('<html>not an image</html>'));
  assert.equal(bad.status, 422);
  assert.match(bad.json.errors.photo, /Only JPEG and PNG/);
  const big = await putPhoto(m.id, Buffer.alloc(PHOTO_MAX_BYTES + 10, 0xff));
  assert.equal(big.status, 413);
  assert.equal(await app.store.getPhoto(m.id), null, 'nothing stored after refused uploads');
  const cur = (await call('GET', `/api/c/memories/${m.id}`, { cookie: S.organizer })).json.record;
  const forged = await call('PATCH', `/api/c/memories/${m.id}`, { cookie: S.organizer, body: { photo: { mime: 'image/png' }, version: cur.version } });
  assert.equal(forged.status, 422, 'the photo field is set by the server only');
});

test('JSON store: photo files are owner-only and photos survive backup and restore', async () => {
  const s = createMemoryStore({ file: path.join(dir, 'b', 'store.json'), initial: () => initialData({ demo: true }) });
  await s.init();
  const p = cleanPhoto(jpegWithMetadata(3));
  await s.putPhoto('MEM-BK1', { mime: p.mime, data: p.data, sha256: p.sha256, createdBy: 'u-classmate' });
  assert.equal(fs.statSync(path.join(dir, 'b', 'photos', 'MEM-BK1.bin')).mode & 0o777, 0o600);
  const dump = await s.exportAll();
  assert.equal(dump.photos.length, 1);
  const t = createMemoryStore({ file: null, initial: null });
  await t.init();
  await t.importAll(dump);
  const back = await t.getPhoto('MEM-BK1');
  assert.ok(back.data.equals(p.data));
  assert.equal(back.sha256, p.sha256);
});

// ---- Fixes from the independent review (27 Oct 2026) ----
const seg = (marker, payload) => { const h = Buffer.alloc(4); h[0] = 0xff; h[1] = marker; h.writeUInt16BE(payload.length + 2, 2); return Buffer.concat([h, payload]); };
const pngChunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td));
  return Buffer.concat([len, td, crc]);
};

test('review fix: PNG chunks must have valid checksums and a real header; private chunks are removed', () => {
  const good = pngWithText();
  const broken = Buffer.from(good); broken[broken.length - 20] ^= 0xff;
  assert.throws(() => cleanPhoto(broken), /damaged/, 'a wrong checksum is refused');
  const sig = good.subarray(0, 8);
  const hugeHeader = Buffer.concat([sig, Buffer.from([0x7f, 0xff, 0xff, 0xff]), Buffer.from('IHDR<html><script>x</script>IEND')]);
  assert.throws(() => cleanPhoto(hugeHeader), /damaged/, 'an oversized header swallowing HTML is refused');
  const withPrivate = Buffer.concat([good.subarray(0, 33), pngChunk('gpSz', Buffer.from('SECRET-GPS-41.82N')), good.subarray(33)]);
  const out = cleanPhoto(withPrivate);
  assert.ok(!out.data.toString('latin1').includes('SECRET-GPS'), 'a private chunk with location text is removed');
  assert.ok(out.removed.includes('gpSz'));
});

test('review fix: JPEG is rebuilt from an allowlist; hidden markers, JFIF extras and table-less files are refused or removed', () => {
  const soi = BASE_JPEG.subarray(0, 2), rest = BASE_JPEG.subarray(2);
  const jfif = Buffer.concat([Buffer.from('JFIF\0', 'latin1'), Buffer.from([1, 1, 0, 0, 1, 0, 1, 0, 0]), Buffer.from('SECRET-JFIF-TAIL')]);
  const hidden = Buffer.concat([soi, seg(0xe0, jfif), seg(0xf0, Buffer.from('SECRET-JPG0')), seg(0x80, Buffer.from('SECRET-RESERVED')), rest]);
  const out = cleanPhoto(hidden);
  assert.ok(!out.data.toString('latin1').includes('SECRET'), 'nothing outside the allowlist survives');
  assert.ok(out.removed.includes('JFIF thumbnail') && out.removed.includes('other marker'));
  const sof = seg(0xc0, Buffer.from([8, 0, 1, 0, 1, 1, 1, 0x11, 0]));
  const noTables = Buffer.concat([soi, sof, seg(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0])), Buffer.from('<html><script>alert(1)</script>'), Buffer.from([0xff, 0xd9])]);
  assert.throws(() => cleanPhoto(noTables), /damaged/, 'a "JPEG" with no image tables is refused');
  const many = Buffer.concat([soi, ...Array.from({ length: 500 }, () => seg(0xc4, Buffer.alloc(0))), rest]);
  assert.throws(() => cleanPhoto(many), /unusual structure/, 'thousands of tiny segments are refused');
});

test('review fix: cleaning is repeatable, and restores re-check every photo', () => {
  for (const input of [jpegWithMetadata(6), pngWithText()]) {
    const once = cleanPhoto(input);
    assert.ok(cleanPhoto(once.data).data.equals(once.data), 'cleaning a cleaned file changes nothing');
  }
  const p = cleanPhoto(jpegWithMetadata(1));
  const entry = { id: 'MEM-R1', mime: p.mime, sha256: p.sha256, createdBy: 'u', createdAt: new Date().toISOString(), data: p.data.toString('base64') };
  assert.equal(restoredPhotos([entry])[0].mime, 'image/jpeg');
  assert.equal(restoredPhotos([{ ...entry, mime: 'text/javascript' }])[0].mime, 'image/jpeg', 'the type comes from the bytes, not the backup');
  assert.throws(() => restoredPhotos([{ ...entry, data: Buffer.from('alert(1)').toString('base64') }]), /not a valid image/);
  assert.throws(() => restoredPhotos([{ ...entry, sha256: 'x' }]), /checksum/);
});

test('review fix: a review and an upload cannot interleave; a rejected memory never keeps photo bytes', async () => {
  const m = await submit('Race check');
  assert.equal((await putPhoto(m.id, jpegWithMetadata())).status, 200);
  const original = app.store.putPhoto;
  app.store.putPhoto = async (...a) => { await new Promise((r) => setTimeout(r, 150)); return original.apply(app.store, a); };
  try {
    const upload = putPhoto(m.id, pngWithText(), S.classmate, { 'Content-Type': 'image/png' });
    await new Promise((r) => setTimeout(r, 40));
    const reject = review(m.id, 'Rejected');
    const [u, rj] = await Promise.all([upload, reject]);
    assert.equal(u.status, 200, 'the upload finished first');
    // The reviewer loaded the memory before the upload saved, so the rejection is refused as stale, never half-applied.
    assert.equal(rj.status, 409);
    assert.ok(await app.store.getPhoto(m.id), 'the new photo is stored with its record');
  } finally { app.store.putPhoto = original; }
  assert.equal((await review(m.id, 'Rejected')).status, 200, 'after reloading, the rejection goes through');
  const final = (await call('GET', `/api/c/memories/${m.id}`, { cookie: S.organizer })).json.record;
  assert.equal(final.status, 'Rejected');
  assert.equal(final.photo, null);
  assert.equal(await app.store.getPhoto(m.id), null, 'no bytes left behind');
  assert.ok(!(await app.store.exportAll()).photos.some((x) => x.id === m.id), 'and none in backups');
});

test('review fix: each member can share up to 40 photos; bad addresses get 400, not a server error', async () => {
  const before = (await app.store.list('memories')).filter((x) => x.submittedBy === 'u-classmate' && x.photo).length;
  for (let i = before; i < 40; i++) {
    const m = await submit(`Cap ${i}`);
    assert.equal((await putPhoto(m.id, pngWithText(), S.classmate, { 'Content-Type': 'image/png' })).status, 200);
  }
  const over = await submit('Cap over');
  const r = await putPhoto(over.id, pngWithText(), S.classmate, { 'Content-Type': 'image/png' });
  assert.equal(r.status, 422);
  assert.match(r.json.errors.photo, /up to 40 photos/);
  assert.equal((await call('GET', '/api/memories/%E0%A4%A/photo', { cookie: S.classmate })).status, 400);
});
