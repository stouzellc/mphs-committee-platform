// Postgres store. Same async contract as memory.js. All queries are parameterized.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { ConflictError, NotFoundError, ConstraintError, keyOf, META_FIELDS } from './errors.js';
import { restoredPhotos } from '../photos.js';

const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

const CONSTRAINT_FIELDS = {
  records_ledger_txn: ['txnId', 'That transaction ID is already recorded'],
  records_ledger_ref: ['providerRef', 'That provider reference is already recorded'],
  records_cabin_id: ['cabinId', 'That Cabin ID already exists'],
  records_participation: ['event', 'This person already has a record for this event'],
  ledger_amount_nonnegative: ['amount', 'Amount cannot be negative'],
  ledger_no_delete: ['_', 'Ledger records cannot be deleted'],
  ledger_void_final: ['status', 'A voided transaction stays void'],
  ledger_confirmed_locked: [null, 'Confirmed transactions are locked. Void with a reason and record a new transaction.'],
  audit_append_only: ['_', 'The audit log is append-only'],
};

function mapPgError(e) {
  if (e.code === '23505' || e.code === '23514') {
    const m = CONSTRAINT_FIELDS[e.constraint];
    if (m) return new ConstraintError(m[0] || e.column || 'status', m[1]);
  }
  return e;
}

const toRecord = (row) => (row ? { ...row.data, version: row.version, updatedAt: row.updated_at.toISOString(), updatedBy: row.updated_by } : undefined);
const toData = (rec) => { const d = { ...rec }; for (const f of META_FIELDS) delete d[f]; return d; };
const toUser = (r) => (r ? {
  id: r.id, username: r.username, email: r.email, displayName: r.display_name, role: r.role, extraPermissions: r.extra_permissions,
  alumniId: r.alumni_id || undefined, active: r.active, demo: r.demo, salt: r.salt || undefined, hash: r.hash || undefined,
} : undefined);
const USER_COLS = { username: 'username', email: 'email', displayName: 'display_name', role: 'role', extraPermissions: 'extra_permissions', alumniId: 'alumni_id', active: 'active', demo: 'demo', salt: 'salt', hash: 'hash' };

export function createPostgresStore({ connectionString, ssl, initial, mode = 'shared', poolSize = 5, runMigrations = true }) {
  const pool = new pg.Pool({ connectionString, ssl, max: poolSize });
  const q = (text, params) => pool.query(text, params);

  async function tx(fn) {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const out = await fn(c);
      await c.query('COMMIT');
      return out;
    } catch (e) {
      await c.query('ROLLBACK').catch(() => {});
      throw mapPgError(e);
    } finally {
      c.release();
    }
  }

  // The database may still be starting (or restarting) when the app boots: retry the first connection briefly.
  async function waitForDatabase(timeoutMs = Number(process.env.DATABASE_CONNECT_TIMEOUT_MS || 20000)) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      try { await q('SELECT 1'); return; } catch (e) {
        const transient = ['ECONNREFUSED', 'ECONNRESET', '57P03'].includes(e.code);
        if (!transient || Date.now() > deadline) throw e;
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  }

  async function migrate() {
    await waitForDatabase();
    await q('CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const done = new Set((await q('SELECT version FROM schema_migrations')).rows.map((r) => r.version));
    for (const f of migrationFiles()) {
      const v = Number(f.split('_')[0]);
      if (done.has(v)) continue;
      await tx(async (c) => {
        await c.query('SELECT pg_advisory_xact_lock(724008)');
        if ((await c.query('SELECT 1 FROM schema_migrations WHERE version = $1', [v])).rowCount) return;
        await c.query(fs.readFileSync(path.join(MIGRATIONS, f), 'utf8'));
        await c.query('INSERT INTO schema_migrations (version) VALUES ($1)', [v]);
      });
    }
  }

  const migrationFiles = () => fs.readdirSync(MIGRATIONS).filter((x) => /^\d+_.*\.sql$/.test(x)).sort();

  // With a restricted app account, migrations are run separately by the owner; the app only verifies they are applied.
  async function verifyMigrated() {
    await waitForDatabase();
    let done = new Set();
    try { done = new Set((await q('SELECT version FROM schema_migrations')).rows.map((r) => r.version)); } catch { /* table missing */ }
    const missing = migrationFiles().map((f) => Number(f.split('_')[0])).filter((v) => !done.has(v));
    if (missing.length) throw new Error(`Database updates ${missing.join(', ')} are not applied. Run "npm run migrate" with the owner's DATABASE_URL first.`);
  }

  async function migrateDown(target) {
    const applied = (await q('SELECT version FROM schema_migrations ORDER BY version DESC')).rows.map((r) => r.version);
    const undone = [];
    for (const v of applied.filter((x) => x > target)) {
      const f = migrationFiles().find((x) => Number(x.split('_')[0]) === v);
      const down = f && path.join(MIGRATIONS, 'down', f);
      if (!down || !fs.existsSync(down)) throw new Error(`No undo step for database update ${v}.`);
      await tx(async (c) => {
        await c.query('SELECT pg_advisory_xact_lock(724008)');
        await c.query(fs.readFileSync(down, 'utf8'));
        await c.query('DELETE FROM schema_migrations WHERE version = $1', [v]);
      });
      undone.push(v);
    }
    return undone;
  }

  async function seed() {
    await tx(async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(724009)');
      if ((await c.query("SELECT 1 FROM meta WHERE key = 'seeded'")).rowCount) return;
      const data = initial();
      for (const [name, list] of Object.entries(data.collections)) {
        for (const r of list) {
          await c.query(
            'INSERT INTO records (collection, id, version, data, updated_at, updated_by) VALUES ($1, $2, $3, $4, $5, $6)',
            [name, r[keyOf(name)], r.version || 1, toData(r), r.updatedAt || new Date().toISOString(), r.updatedBy || 'seed'],
          );
        }
      }
      await c.query("INSERT INTO meta (key, value) VALUES ('seeded', now()::text), ('mode', $1)", [data.mode || mode]);
    });
  }

  async function snapshot(sq) {
    const recs = (await sq('SELECT * FROM records ORDER BY collection, seq')).rows;
    const records = {};
    for (const r of recs) (records[r.collection] ||= []).push(toRecord(r));
    const users = (await sq('SELECT * FROM users ORDER BY created_at, id')).rows.map((r) => ({ ...toUser(r), createdAt: r.created_at.toISOString() }));
    const audit = (await sq('SELECT * FROM audit ORDER BY id')).rows.map((a) => ({ at: a.at.toISOString(), userId: a.user_id, action: a.action, collection: a.collection, id: a.record_id, fields: a.fields }));
    const migrations = (await sq('SELECT version FROM schema_migrations ORDER BY version')).rows.map((r) => r.version);
    const modeRow = (await sq("SELECT value FROM meta WHERE key = 'mode'")).rows[0];
    const photos = (await sq('SELECT * FROM photos ORDER BY memory_id')).rows.map((p) => ({ id: p.memory_id, mime: p.mime, sha256: p.sha256, createdBy: p.created_by, createdAt: p.created_at.toISOString(), data: p.bytes.toString('base64') }));
    return { mode: modeRow?.value || mode, migrations, records, users, audit, photos };
  }

  async function writeAudit(c, userId, action, collection, id, fields) {
    await c.query('INSERT INTO audit (user_id, action, collection, record_id, fields) VALUES ($1, $2, $3, $4, $5)', [userId, action, collection, String(id), fields]);
  }

  return {
    kind: 'postgres',
    pool,
    async init() { if (runMigrations) await migrate(); else await verifyMigrated(); if (initial) await seed(); },
    migrate,
    migrateDown,
    async migrationStatus() {
      let done = [];
      try { done = (await q('SELECT version FROM schema_migrations ORDER BY version')).rows.map((r) => r.version); } catch { /* none yet */ }
      return { applied: done, available: migrationFiles().map((f) => Number(f.split('_')[0])) };
    },
    async close() { await pool.end(); },
    async mode() { return (await q("SELECT value FROM meta WHERE key = 'mode'")).rows[0]?.value || mode; },
    async getMeta(key) { return (await q('SELECT value FROM meta WHERE key = $1', [key])).rows[0]?.value ?? null; },
    async setMeta(key, value) { await q('INSERT INTO meta (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING', [key, String(value)]); },

    async list(name) {
      return (await q('SELECT * FROM records WHERE collection = $1 ORDER BY seq', [name])).rows.map(toRecord);
    },
    async get(name, id) {
      return toRecord((await q('SELECT * FROM records WHERE collection = $1 AND id = $2', [name, id])).rows[0]);
    },
    async insert(name, record, userId) {
      const id = record[keyOf(name)];
      const created = await tx(async (c) => {
        const r = await c.query(
          'INSERT INTO records (collection, id, data, updated_by) VALUES ($1, $2, $3, $4) ON CONFLICT (collection, id) DO NOTHING RETURNING *',
          [name, id, toData(record), userId],
        );
        if (!r.rowCount) return null;
        await writeAudit(c, userId, 'create', name, id, Object.keys(record));
        return toRecord(r.rows[0]);
      });
      if (!created) throw new ConflictError(await this.get(name, id));
      return created;
    },
    async update(name, id, patch, expectedVersion, userId) {
      return tx(async (c) => {
        const cur = (await c.query('SELECT * FROM records WHERE collection = $1 AND id = $2 FOR UPDATE', [name, id])).rows[0];
        if (!cur) throw new NotFoundError();
        if (cur.version !== expectedVersion) throw new ConflictError(toRecord(cur));
        const before = cur.data;
        const changed = Object.keys(patch).filter((f) => JSON.stringify(before[f]) !== JSON.stringify(patch[f]));
        const r = await c.query(
          'UPDATE records SET data = $3, version = version + 1, updated_at = now(), updated_by = $4 WHERE collection = $1 AND id = $2 RETURNING *',
          [name, id, toData({ ...before, ...patch }), userId],
        );
        await writeAudit(c, userId, 'update', name, id, changed);
        return toRecord(r.rows[0]);
      });
    },
    async remove(name, id, expectedVersion, userId) {
      await tx(async (c) => {
        const cur = (await c.query('SELECT * FROM records WHERE collection = $1 AND id = $2 FOR UPDATE', [name, id])).rows[0];
        if (!cur) throw new NotFoundError();
        if (cur.version !== expectedVersion) throw new ConflictError(toRecord(cur));
        await c.query('DELETE FROM records WHERE collection = $1 AND id = $2', [name, id]);
        await writeAudit(c, userId, 'delete', name, id, []);
      });
    },
    async history(name, id) {
      const r = id
        ? await q('SELECT * FROM audit WHERE collection = $1 AND record_id = $2 ORDER BY id', [name, id])
        : await q('SELECT * FROM audit WHERE collection = $1 ORDER BY id DESC LIMIT 1000', [name]);
      const rows = id ? r.rows : r.rows.reverse();
      return rows.map((a) => ({ at: a.at.toISOString(), userId: a.user_id, action: a.action, collection: a.collection, id: a.record_id, fields: a.fields }));
    },
    async audit({ userId, action, collection, id, fields = [] }) {
      await q('INSERT INTO audit (user_id, action, collection, record_id, fields) VALUES ($1, $2, $3, $4, $5)', [userId, action, collection, String(id), fields]);
    },

    async listUsers() { return (await q('SELECT * FROM users ORDER BY created_at, id')).rows.map(toUser); },
    async getUser(id) { return toUser((await q('SELECT * FROM users WHERE id = $1', [id])).rows[0]); },
    async findUserByUsername(u) { return toUser((await q('SELECT * FROM users WHERE username = $1', [u])).rows[0]); },
    async findUserByEmail(email) {
      const e = String(email || '').trim().toLowerCase();
      return e ? toUser((await q("SELECT * FROM users WHERE email <> '' AND lower(email) = $1", [e])).rows[0]) : undefined;
    },
    async createUser(u) {
      try {
        const r = await q(
          `INSERT INTO users (id, username, email, display_name, role, extra_permissions, alumni_id, active, demo, salt, hash)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
          [u.id, u.username, u.email || '', u.displayName, u.role, u.extraPermissions || [], u.alumniId || null, u.active !== false, !!u.demo, u.salt || null, u.hash || null],
        );
        return toUser(r.rows[0]);
      } catch (e) {
        if (e.code === '23505') throw new ConflictError(null);
        throw e;
      }
    },
    async updateUser(id, patch) {
      const sets = []; const vals = [id];
      for (const [k, col] of Object.entries(USER_COLS)) if (k in patch) { vals.push(k === 'alumniId' ? patch[k] || null : patch[k]); sets.push(`${col} = $${vals.length}`); }
      if (!sets.length) return this.getUser(id);
      try {
        const r = await q(`UPDATE users SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, vals);
        if (!r.rowCount) throw new NotFoundError();
        return toUser(r.rows[0]);
      } catch (e) {
        if (e.code === '23505') throw new ConflictError(null);
        throw e;
      }
    },
    async countUsers() { return Number((await q('SELECT count(*) FROM users')).rows[0].count); },

    async createSession(hash, userId, expires) {
      await q('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, to_timestamp($3 / 1000.0))', [hash, userId, expires]);
      await q('DELETE FROM sessions WHERE expires_at < now()');
    },
    async getSession(hash) {
      const r = (await q('SELECT user_id, expires_at FROM sessions WHERE token_hash = $1', [hash])).rows[0];
      return r ? { userId: r.user_id, expires: r.expires_at.getTime() } : undefined;
    },
    async deleteSession(hash) { await q('DELETE FROM sessions WHERE token_hash = $1', [hash]); },
    async deleteUserSessions(userId) { await q('DELETE FROM sessions WHERE user_id = $1', [userId]); },

    async createInvite(hash, { userId, purpose, expires, createdBy }) {
      await q('INSERT INTO invites (token_hash, user_id, purpose, created_by, expires_at) VALUES ($1, $2, $3, $4, to_timestamp($5 / 1000.0))', [hash, userId, purpose, createdBy, expires]);
    },
    async getInvite(hash) {
      const r = (await q('SELECT user_id, purpose, expires_at FROM invites WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()', [hash])).rows[0];
      return r ? { userId: r.user_id, purpose: r.purpose, expires: r.expires_at.getTime() } : null;
    },
    async useInvite(hash) {
      // Atomic: two simultaneous uses of the same link cannot both succeed.
      const r = (await q('UPDATE invites SET used_at = now() WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() RETURNING user_id, purpose, expires_at, created_by', [hash])).rows[0];
      return r ? { userId: r.user_id, purpose: r.purpose, expires: r.expires_at.getTime(), createdBy: r.created_by } : null;
    },
    async revokeInvites(userId) { await q('DELETE FROM invites WHERE user_id = $1 AND used_at IS NULL', [userId]); },
    async activeInvite(userId) {
      const r = (await q('SELECT purpose, expires_at, created_at FROM invites WHERE user_id = $1 AND used_at IS NULL AND expires_at > now() ORDER BY created_at DESC LIMIT 1', [userId])).rows[0];
      return r ? { userId, purpose: r.purpose, expires: r.expires_at.getTime(), createdAt: r.created_at.getTime() } : null;
    },
    async recordLoginFailure(key) {
      await q('INSERT INTO login_failures (key) VALUES ($1)', [key]);
      await q("DELETE FROM login_failures WHERE at < now() - interval '1 day'");
    },
    async recentLoginFailures(key, sinceMs) {
      return Number((await q('SELECT count(*) FROM login_failures WHERE key = $1 AND at >= to_timestamp($2 / 1000.0)', [key, sinceMs])).rows[0].count);
    },
    async clearLoginFailures(key) { await q('DELETE FROM login_failures WHERE key = $1', [key]); },

    // Full logical backup: records, members (with password hashes), audit history, memory photos, mode. Sessions, sign-in state,
    // open invite links and attempt counters are deliberately left out.
    async exportAll() {
      // One read-only, repeatable-read transaction: a consistent snapshot even while the site is in use.
      const c = await pool.connect();
      try {
        await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        const out = await snapshot(c.query.bind(c), this);
        await c.query('COMMIT');
        return out;
      } catch (e) {
        await c.query('ROLLBACK').catch(() => {});
        throw e;
      } finally { c.release(); }
    },
    async auditWritable() {
      const r = (await q("SELECT has_table_privilege(current_user, 'audit', 'UPDATE') OR has_table_privilege(current_user, 'audit', 'DELETE') OR has_table_privilege(current_user, 'audit', 'TRUNCATE') AS w")).rows[0];
      return !!r.w;
    },
    async isEmpty() {
      return Number((await q('SELECT (SELECT count(*) FROM records) + (SELECT count(*) FROM users) AS n')).rows[0].n) === 0;
    },
    async importAll(b) {
      const photos = restoredPhotos(b.photos);
      await tx(async (c) => {
        if (Number((await c.query('SELECT (SELECT count(*) FROM records) + (SELECT count(*) FROM users) AS n')).rows[0].n) !== 0) throw new Error('Restore target is not empty.');
        for (const [name, list] of Object.entries(b.records)) {
          for (const r of list) {
            await c.query('INSERT INTO records (collection, id, version, data, updated_at, updated_by) VALUES ($1, $2, $3, $4, $5, $6)',
              [name, r[keyOf(name)], r.version, toData(r), r.updatedAt, r.updatedBy]);
          }
        }
        for (const u of b.users) {
          await c.query(`INSERT INTO users (id, username, email, display_name, role, extra_permissions, alumni_id, active, demo, salt, hash, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [u.id, u.username, u.email || '', u.displayName, u.role, u.extraPermissions || [], u.alumniId || null, u.active !== false, !!u.demo, u.salt || null, u.hash || null, u.createdAt || new Date().toISOString()]);
        }
        for (const a of b.audit) {
          await c.query('INSERT INTO audit (at, user_id, action, collection, record_id, fields) VALUES ($1, $2, $3, $4, $5, $6)', [a.at, a.userId, a.action, a.collection, String(a.id), a.fields || []]);
        }
        for (const p of photos) {
          await c.query('INSERT INTO photos (memory_id, mime, bytes, sha256, created_by, created_at) VALUES ($1, $2, $3, $4, $5, $6)', [p.id, p.mime, p.data, p.sha256, p.createdBy, p.createdAt]);
        }
        await c.query("INSERT INTO meta (key, value) VALUES ('seeded', now()::text), ('mode', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [b.mode || 'shared']);
      });
    },

    async putPhoto(id, { mime, data, sha256, createdBy }) {
      await q(`INSERT INTO photos (memory_id, mime, bytes, sha256, created_by) VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (memory_id) DO UPDATE SET mime = EXCLUDED.mime, bytes = EXCLUDED.bytes, sha256 = EXCLUDED.sha256, created_by = EXCLUDED.created_by, created_at = now()`,
      [id, mime, data, sha256, createdBy]);
    },
    async getPhoto(id) {
      const r = (await q('SELECT mime, bytes, sha256 FROM photos WHERE memory_id = $1', [id])).rows[0];
      return r ? { mime: r.mime, data: r.bytes, sha256: r.sha256 } : null;
    },
    async deletePhoto(id) { await q('DELETE FROM photos WHERE memory_id = $1', [id]); },

    async putAuthState(state, data, expires) {
      await q('INSERT INTO auth_states (state, data, expires_at) VALUES ($1, $2, to_timestamp($3 / 1000.0))', [state, data, expires]);
    },
    async takeAuthState(state) {
      const r = await q('DELETE FROM auth_states WHERE state = $1 RETURNING data, expires_at', [state]);
      await q('DELETE FROM auth_states WHERE expires_at < now()');
      const row = r.rows[0];
      return row && row.expires_at.getTime() >= Date.now() ? row.data : null;
    },
  };
}
