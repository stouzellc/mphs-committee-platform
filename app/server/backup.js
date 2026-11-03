// Backup format and encryption. A backup holds private data (roster, contact fields, password hashes), so it is
// encrypted with a passphrase (AES-256-GCM, key derived with scrypt) unless the operator explicitly opts out.
import crypto from 'node:crypto';
import fs from 'node:fs';

export const FORMAT = 'mphs-backup';
const MAGIC_V1 = Buffer.from('MPHSBK1\n');
const MAGIC = Buffer.from('MPHSBK2\n');
const KDF = { N: 2 ** 15, r: 8, p: 1 };
const kdf = (pass, salt, { N, r, p }) => crypto.scryptSync(pass, salt, 32, { N, r, p, maxmem: 256 * 1024 * 1024 });

// Passphrase from BACKUP_PASSPHRASE_FILE (preferred: stays out of shell history) or BACKUP_PASSPHRASE.
export function passphraseFromEnv(env = process.env) {
  if (env.BACKUP_PASSPHRASE_FILE) return fs.readFileSync(env.BACKUP_PASSPHRASE_FILE, 'utf8').replace(/\r?\n$/, '');
  return env.BACKUP_PASSPHRASE || '';
}

export function encryptBackup(obj, passphrase) {
  if (!passphrase || passphrase.length < 12) throw new Error('Backup passphrase must be at least 12 characters.');
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const params = Buffer.alloc(12);
  params.writeUInt32BE(KDF.N, 0); params.writeUInt32BE(KDF.r, 4); params.writeUInt32BE(KDF.p, 8);
  const header = Buffer.concat([MAGIC, params, salt, iv]);
  const cipher = crypto.createCipheriv('aes-256-gcm', kdf(passphrase, salt, KDF), iv);
  cipher.setAAD(header);
  const body = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()]);
  return Buffer.concat([header, cipher.getAuthTag(), body]);
}

export const isEncrypted = (buf) => buf.subarray(0, MAGIC.length).equals(MAGIC) || buf.subarray(0, MAGIC_V1.length).equals(MAGIC_V1);

export function decryptBackup(buf, passphrase) {
  if (!isEncrypted(buf)) {
    let obj;
    try { obj = JSON.parse(buf.toString('utf8')); } catch { throw new Error('Not an MPHS backup file.'); }
    if (obj.format !== FORMAT) throw new Error('Not an MPHS backup file.');
    return obj;
  }
  if (!passphrase) throw new Error('This backup is encrypted. Set BACKUP_PASSPHRASE_FILE or BACKUP_PASSPHRASE.');
  const v2 = buf.subarray(0, MAGIC.length).equals(MAGIC);
  let o = MAGIC.length;
  let params = KDF;
  if (v2) {
    params = { N: buf.readUInt32BE(o), r: buf.readUInt32BE(o + 4), p: buf.readUInt32BE(o + 8) };
    o += 12;
    if (params.N > 2 ** 20 || params.r > 32 || params.p > 16) throw new Error('Backup file has unsupported encryption settings.');
  }
  const salt = buf.subarray(o, (o += 16));
  const iv = buf.subarray(o, (o += 12));
  const header = buf.subarray(0, o);
  const tag = buf.subarray(o, (o += 16));
  const decipher = crypto.createDecipheriv('aes-256-gcm', kdf(passphrase, salt, params), iv);
  if (v2) decipher.setAAD(header);
  decipher.setAuthTag(tag);
  let text;
  try { text = Buffer.concat([decipher.update(buf.subarray(o)), decipher.final()]).toString('utf8'); } catch { throw new Error('Wrong passphrase, or the backup file is damaged.'); }
  const obj = JSON.parse(text);
  if (obj.format !== FORMAT) throw new Error('Not an MPHS backup file.');
  return obj;
}

export function summarize(b) {
  const records = Object.fromEntries(Object.entries(b.records).map(([k, v]) => [k, v.length]));
  return { createdAt: b.createdAt, source: b.source, users: b.users.length, audit: b.audit.length, photos: (b.photos || []).length, records };
}
