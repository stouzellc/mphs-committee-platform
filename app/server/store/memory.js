// Local store: one JSON file, atomic writes, optimistic versioning. Same async contract as postgres.js.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ConflictError, NotFoundError, keyOf } from './errors.js';
import { restoredPhotos } from '../photos.js';

export function createMemoryStore({ file, initial }) {
  let db;
  const clone = (o) => (o === undefined || o === null ? o ?? undefined : structuredClone(o));
  // Photo bytes live beside the JSON file (owner-only files), or in memory when there is no file.
  const photoDir = file ? path.join(path.dirname(file), 'photos') : null;
  const photoBytes = new Map();
  const photoFile = (id) => {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw new Error('Invalid photo id');
    return path.join(photoDir, `${id}.bin`);
  };
  const readPhoto = (id) => (photoDir ? (fs.existsSync(photoFile(id)) ? fs.readFileSync(photoFile(id)) : null) : photoBytes.get(id) || null);
  const writePhoto = (id, data) => {
    if (!photoDir) return void photoBytes.set(id, Buffer.from(data));
    fs.mkdirSync(photoDir, { recursive: true, mode: 0o700 });
    const tmp = `${photoFile(id)}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    fs.writeFileSync(tmp, data, { mode: 0o600 });
    fs.renameSync(tmp, photoFile(id));
  };

  function persist() {
    if (!file) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db, null, 1), { mode: 0o600 });
    fs.renameSync(tmp, file);
  }
  const col = (name) => (db.collections[name] ||= []);
  const find = (name, id) => col(name).find((r) => r[keyOf(name)] === id);
  const pushAudit = (userId, action, collection, id, fields) => {
    db.audit.push({ at: new Date().toISOString(), userId, action, collection, id, fields });
    if (db.audit.length > 5000) db.audit.splice(0, db.audit.length - 5000);
  };

  return {
    kind: 'memory',
    async init() {
      if (file && fs.existsSync(file)) db = JSON.parse(fs.readFileSync(file, 'utf8'));
      else { db = initial ? initial() : { schemaVersion: 1, mode: 'shared', collections: {} }; persist(); }
      db.users ||= []; db.sessions ||= {}; db.authStates ||= {}; db.audit ||= []; db.invites ||= {}; db.loginFailures ||= {}; db.photos ||= {};
    },
    async close() {},
    async mode() { return db.mode; },
    async getMeta(key) { return (db.meta || {})[key] ?? null; },
    async setMeta(key, value) { db.meta ||= {}; if (!(key in db.meta)) { db.meta[key] = value; persist(); } },

    async list(name) { return clone(col(name)); },
    async get(name, id) { return clone(find(name, id)); },
    async insert(name, record, userId) {
      const k = keyOf(name);
      const existing = find(name, record[k]);
      if (existing) throw new ConflictError(clone(existing));
      const r = { ...record, version: 1, updatedAt: new Date().toISOString(), updatedBy: userId };
      col(name).push(r);
      pushAudit(userId, 'create', name, r[k], Object.keys(record));
      persist();
      return clone(r);
    },
    async update(name, id, patch, expectedVersion, userId) {
      const list = col(name);
      const i = list.findIndex((r) => r[keyOf(name)] === id);
      if (i < 0) throw new NotFoundError();
      if (list[i].version !== expectedVersion) throw new ConflictError(clone(list[i]));
      const changed = Object.keys(patch).filter((f) => JSON.stringify(list[i][f]) !== JSON.stringify(patch[f]));
      list[i] = { ...list[i], ...patch, version: list[i].version + 1, updatedAt: new Date().toISOString(), updatedBy: userId };
      pushAudit(userId, 'update', name, id, changed);
      persist();
      return clone(list[i]);
    },
    async remove(name, id, expectedVersion, userId) {
      const list = col(name);
      const i = list.findIndex((r) => r[keyOf(name)] === id);
      if (i < 0) throw new NotFoundError();
      if (list[i].version !== expectedVersion) throw new ConflictError(clone(list[i]));
      list.splice(i, 1);
      pushAudit(userId, 'delete', name, id, []);
      persist();
    },
    async history(name, id) { return clone(db.audit.filter((a) => a.collection === name && (!id || a.id === id))); },
    async audit({ userId, action, collection, id, fields = [] }) { pushAudit(userId, action, collection, id, fields); persist(); },

    async listUsers() { return clone(db.users); },
    async getUser(id) { return clone(db.users.find((u) => u.id === id)); },
    async findUserByUsername(username) { return clone(db.users.find((u) => u.username === username)); },
    async findUserByEmail(email) {
      const e = String(email || '').trim().toLowerCase();
      return e ? clone(db.users.find((u) => (u.email || '').toLowerCase() === e)) : undefined;
    },
    async createUser(user) {
      if (db.users.some((u) => u.id === user.id || u.username === user.username)) throw new ConflictError(null);
      if (user.email && db.users.some((u) => (u.email || '').toLowerCase() === user.email.toLowerCase())) throw new ConflictError(null);
      db.users.push({ extraPermissions: [], active: true, demo: false, ...user });
      persist();
      return clone(db.users.at(-1));
    },
    async updateUser(id, patch) {
      const u = db.users.find((x) => x.id === id);
      if (!u) throw new NotFoundError();
      if (patch.email && db.users.some((x) => x.id !== id && (x.email || '').toLowerCase() === patch.email.toLowerCase())) throw new ConflictError(null);
      if (patch.username && db.users.some((x) => x.id !== id && x.username === patch.username)) throw new ConflictError(null);
      Object.assign(u, patch);
      persist();
      return clone(u);
    },
    async countUsers() { return db.users.length; },

    async createSession(hash, userId, expires) { db.sessions[hash] = { userId, expires }; persist(); },
    async getSession(hash) { return clone(db.sessions[hash]); },
    async deleteSession(hash) { delete db.sessions[hash]; persist(); },
    async deleteUserSessions(userId) {
      for (const [k, s] of Object.entries(db.sessions)) if (s.userId === userId) delete db.sessions[k];
      persist();
    },

    async createInvite(hash, { userId, purpose, expires, createdBy }) {
      db.invites[hash] = { userId, purpose, expires, createdBy, createdAt: Date.now(), usedAt: null };
      persist();
    },
    async getInvite(hash) {
      const i = db.invites[hash];
      return i && !i.usedAt && i.expires > Date.now() ? clone(i) : null;
    },
    async useInvite(hash) {
      const i = db.invites[hash];
      if (!i || i.usedAt || i.expires <= Date.now()) return null;
      i.usedAt = Date.now();
      persist();
      return clone(i);
    },
    async revokeInvites(userId) {
      for (const [k, i] of Object.entries(db.invites)) if (i.userId === userId && !i.usedAt) delete db.invites[k];
      persist();
    },
    async activeInvite(userId) {
      const list = Object.values(db.invites).filter((i) => i.userId === userId && !i.usedAt && i.expires > Date.now());
      return list.length ? clone(list.sort((a, b) => b.createdAt - a.createdAt)[0]) : null;
    },
    async recordLoginFailure(key) {
      const day = Date.now() - 86400e3;
      for (const [k, list] of Object.entries(db.loginFailures)) {
        const kept = list.filter((t) => t >= day);
        if (kept.length) db.loginFailures[k] = kept; else delete db.loginFailures[k];
      }
      (db.loginFailures[key] ||= []).push(Date.now());
      persist();
    },
    async recentLoginFailures(key, sinceMs) {
      return (db.loginFailures[key] || []).filter((t) => t >= sinceMs).length;
    },
    async clearLoginFailures(key) { delete db.loginFailures[key]; persist(); },

    async exportAll() {
      const users = db.users.map((u) => clone(u));
      const photos = Object.entries(db.photos).map(([id, p]) => ({ id, ...clone(p), data: (readPhoto(id) || Buffer.alloc(0)).toString('base64') }));
      return { mode: db.mode, migrations: ['json'], records: clone(db.collections), users, audit: clone(db.audit), photos };
    },
    async isEmpty() {
      return !db.users.length && Object.values(db.collections).every((l) => !l.length);
    },
    async importAll(b) {
      if (!(await this.isEmpty())) throw new Error('Restore target is not empty.');
      const photos = restoredPhotos(b.photos);
      db.collections = clone(b.records);
      db.users = clone(b.users);
      db.audit = clone(b.audit);
      db.mode = b.mode || db.mode;
      db.sessions = {}; db.invites = {}; db.authStates = {}; db.loginFailures = {}; db.photos = {};
      for (const { id, data, mime, sha256, createdBy, createdAt } of photos) { writePhoto(id, data); db.photos[id] = { mime, sha256, createdBy, createdAt }; }
      persist();
    },

    async putPhoto(id, { mime, data, sha256, createdBy }) {
      writePhoto(id, data);
      db.photos[id] = { mime, sha256, createdBy, createdAt: new Date().toISOString() };
      persist();
    },
    async getPhoto(id) {
      const meta = db.photos[id];
      const data = meta && readPhoto(id);
      return data ? { mime: meta.mime, data, sha256: meta.sha256 } : null;
    },
    async deletePhoto(id) {
      if (photoDir) fs.rmSync(photoFile(id), { force: true }); else photoBytes.delete(id);
      delete db.photos[id];
      persist();
    },

    async putAuthState(state, data, expires) { db.authStates[state] = { data, expires }; persist(); },
    async takeAuthState(state) {
      const s = db.authStates[state];
      delete db.authStates[state];
      for (const [k, v] of Object.entries(db.authStates)) if (v.expires < Date.now()) delete db.authStates[k];
      persist();
      return s && s.expires >= Date.now() ? s.data : null;
    },
  };
}
