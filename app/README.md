# MPHS Class of 2008: local experience and organizer workspace

Two event stories (*Back to Pleasant* and *Pleasant, Beyond the Shore*), a living memories gallery, a committee handbook, a classmate area and an organizer workspace with server-side permissions and persistent local storage.

**Status: local demo.** Accounts and CRM, ledger, sponsor and cabin records are fictional. Nothing is deployed, shared or published.

## Run it

Requires Node.js 20 or newer (tested on 24.20).

```bash
cd app
npm install
npm start
```

`npm install` brings in `pg` (the Postgres driver) and, for local testing only, `embedded-postgres`, which downloads real PostgreSQL 18 binaries (about 150 MB) from npm. Without `DATABASE_URL` the app uses the local JSON file store and needs neither.

Open http://127.0.0.1:4173. On first start the server creates `app/data/store.json` and `app/data/demo-credentials.local.txt` (owner-only permissions, never served over HTTP). With Postgres, the demo passwords go to `app/data/demo-credentials.postgres.local.txt` instead. Sign in with `admin.demo@example.invalid` (or the username `admin.demo`), `organizer.demo`, `treasurer.demo` or `classmate.demo`, using the passwords in that file.

```bash
npm test            # JSON store: 97 tests (money rules, access, exports, conflicts, persistence, sign-in, private site, invites, launch check, backups); 15 Postgres-only tests skip
npm run test:pg     # the same plus database-level tests against a throwaway local Postgres: 111 tests
npm run dev:local   # the private committee site with personal passwords on the local Postgres (started if needed)
npm run db:local    # persistent local Postgres on 127.0.0.1:5433 (data in app/.pgdata); prints the DATABASE_URL to use
npm run dev:oidc -- --local-pg   # app + local mock sign-in provider on :4180, using the db:local database (started automatically if it isn't running)
npm run reset-demo  # moves data/ files aside (*.bak-<time>); the next start recreates demo data and new passwords
```

If npm skipped the Postgres package's install script, the scripts above restore its library links automatically.

Environment variables are listed, by name only, in `.env.example`.

## Routes

| Route | What it is | Access |
| --- | --- | --- |
| `#/` | Editorial entrance: class identity, two doors, planning status | Public |
| `#/reunion`, `/text`, `/present` | Back to Pleasant story, text view, keyboard presentation with presenter notes | Public |
| `#/cruise`, `/text`, `/present` | Pleasant, Beyond the Shore story, text view, presentation | Public |
| `#/gallery` | Seven artworks with filters, zoom and descriptions | Public |
| `#/handbook` | Searchable committee handbook with message drafts | Organizers (chapters are served by the API only with `planning`) |
| `#/me` | A classmate's own participation and memory submissions | Signed-in classmate |
| `#/workspace/*` | Overview, decisions, tasks, budgets, sponsors, quotes, run of show, merchandise, communications, closeout, activity, CRM, cabins, ledger, memory review, access | Per-permission, enforced by the server |

Presentation keys: ← → / Space / PageUp / PageDown, Home, End, N notes, F full screen, Esc exit. Swipe works on touch.

## Architecture

```
app/
  shared/finance.js   Pure money/planning rules used by server and browser
  server/app.js       HTTP routes, static allowlist, auth, CRUD with version checks, exports
  server/auth.js      scrypt password hashes, server-side sessions (HttpOnly, SameSite=Lax), attempt limits
  server/policy.js    Collection permissions, field redaction, input schemas
  server/store/       memory.js (JSON file) and postgres.js (+ migrations/, migrations/down/, ssl.js)
  server/launch-check.js, backup.js, passwords.js, oidc.js, art.js, import.js
  server/seed.js      v1 tracker records (with source cell refs) and fictional demo fixtures
  server/handbook.js  Committee handbook chapters (served to organizers only)
  public/             index.html, css/, js/ (router, content, views); no build step
  tests/              node:test suites
```

Storage is behind one async contract (`server/store/`): records (`list/get/insert/update/remove/history`), audit, users, sessions and sign-in state. Two implementations pass the same tests:

- `memory.js`: the local JSON file (`data/store.json`), used when `DATABASE_URL` is unset.
- `postgres.js`: used when `DATABASE_URL` is set. Migrations in `server/store/migrations/` run at startup under an advisory lock; seeding runs once. Records keep their fields in JSONB, and the database enforces the rules itself: case-insensitive unique transaction IDs, provider references and Cabin IDs; one participation row per person per event; non-negative amounts; confirmed ledger rows locked except for voiding; ledger rows never deleted; an append-only audit table (update, delete and truncate are refused). Edits lock the row and compare versions, so two simultaneous saves of the same version produce exactly one success and one conflict.

### Private committee site and personal passwords

By default the server runs as a **private site** (`MPHS_PRIVATE_SITE=0` turns it off). It **fails closed**:

- Signed-out visitors get only an explicit list of files: the page shell, the favicon, the stylesheets, the four scripts the sign-in page needs, and the seal in the top bar. Every other file under `public/`, the other artwork and every data route return 401 until someone signs in.
- Request paths are normalised once, and matched case-sensitively against an inventory of real files built at startup. Double slashes, dot segments and capital letters therefore cannot reach locked code.
- Views load on demand. Tests check every file in `public/`, and check that the signed-out code never imports a locked file.

Members get in with personal passwords:

1. An administrator adds the member under **Access** with the email they will sign in with. The app creates a **one-time invite link** (valid 7 days) and shows it once. The app sends no email: the administrator passes the link on.
2. The member opens the link, sees their name and email, and sets a password: at least 12 characters, not a common password, not built from their name, email or the school or class name. They are signed in straight away.
3. Afterwards they sign in with their email and password. **Your account** lets them change it, which signs them out everywhere else.
4. Forgotten password: the administrator clicks **Create reset link**. A new link cancels any earlier one. Using it replaces the password and ends the member's other sessions. Deactivating a member ends their sessions and cancels their links.

The token is in the URL fragment, which browsers never send to the server. It travels to the server only in a request body, and the page removes it from the address bar after reading it. Only its SHA-256 hash is stored, and two simultaneous uses of one link cannot both succeed. Changing a member's email or deactivating them cancels their open links. The old email stops working as a sign-in name, so it can be given to someone else. A first password can only be set through an administrator's link, never from an existing session. When provider sign-in is the only method, all password routes are refused.

**Password storage.** Passwords are hashed with async scrypt (N=2^16, r=8, p=1: about 64 MiB per hash). The parameters are stored with each hash, and older hashes upgrade automatically at the next sign-in. Unknown accounts still go through one full hash, so response time doesn't reveal who is a member.

**Attempt limits** are counted in the database, so they survive restarts and work across several app instances:
- 10 failures per address per account in 10 minutes. The username and email share one counter.
- 30 failures per address across all accounts.

There is deliberately no lock that someone elsewhere could trigger against a member. Set `TRUST_PROXY` to the number of trusted proxies in front of the app (1 for the host's proxy, 2 if a CDN sits in front of it, 0 if visitors connect directly), so the client address comes from the right `X-Forwarded-For` entry. The launch check requires it.

**Administrators.** `admin.users` is full privilege: it can change roles, including its own, and can issue a reset link for any member, including other administrators. Each password set through a link is audited with who issued the link. Keep administrators to two named people.

**HTTPS.** With `COOKIE_SECURE=1` the session cookie becomes `__Host-mphs_session; Secure`, and responses carry `Strict-Transport-Security`.

### Sign-in

- **Passwords** (default): demo accounts locally, and personal passwords set through invite links as above. Server-side sessions.
- **OpenID Connect** when `AUTH_PROVIDER_ISSUER` is set: authorization code with PKCE; the ID token's signature (RS256 or ES256, from the provider's published keys), issuer, audience, expiry, issue time and nonce are checked; the email must be verified. Access is invite-only: the verified email must match a member an administrator added under Access. Password sign-in is then off unless `MPHS_ALLOW_PASSWORD_LOGIN=1`. Callback errors return to the sign-in page with a plain-language reason; the attempted email is never stored.
- Session cookies are `HttpOnly; SameSite=Lax` (Lax so the session survives the provider's redirect back), and `Secure` behind HTTPS. Mutations still need the `X-MPHS` header and a same-origin `Origin`.

`scripts/mock-oidc.js` is a local stand-in provider for tests and offline development. It signs in any email typed into it and binds to 127.0.0.1 only.

### Permissions

| Permission | Grants |
| --- | --- |
| `self` | Own participation and memory submissions |
| `planning` | Decisions, tasks, budgets, tickets, sponsors, quotes, program, merch, comms, closeout, handbook |
| `crm.view` | Classmate records (contact fields redacted), participation (agreed totals redacted), cabins |
| `crm.contact` | Contact fields; create and edit people |
| `crm.finance` | Ledger, balances, agreed totals |
| `memories.moderate` | Review submissions |
| `admin.users` | Roles, permissions, deactivation |

Roles: classmate = `self`; organizer = `self, planning` plus granted extras; admin = all. Hiding a link is cosmetic; every API route checks the permission, and exports apply the same redaction. Hard deletes are allowed only for tasks, quotes, program, merchandise, comms and ticket options; decisions are superseded or rejected, CRM and ledger records change status.

### Data model

Separate collections, never merged: `people` (stable `alumniId`, source spelling, provenance, corrections log), `participation` (one per person per event, status, agreed total, guests, cabin ID), `cabins` (unique Cabin ID, capacity, provider confirmation), `ledger` (unique `txnId` and `providerRef`, positive amount, Payment/Refund, Confirmed/Pending/Failed/Void, received by provider or committee), `sponsors` (proposed and committed amounts kept apart), `decisions` (approver, date, evidence, supersedes/superseded-by), `tasks`, `budgetLines` + `budgetSettings` (reserve rate labelled as an assumption), `tickets`, `quotes` (amount, basis, occupancy, validity), `program`, `merch`, `comms`, `closeout`, `memories` (permission, approved use, review status, withdrawal, optional photo). Photo bytes are kept apart from the records (the `photos` table, or owner-only files in `data/photos/` for the local store); `server/photos.js` accepts only real JPEG/PNG data and removes EXIF/GPS, comments, other metadata and anything appended after the image, keeping only the orientation number. A photo reaches other members only when a reviewer approves the memory and ticks “Show in the members’ gallery” (`showInGallery`).

Every record carries `version`, `updatedAt` and `updatedBy`. Edits send the version they started from; a stale version returns 409 with the current record and the UI shows a conflict panel instead of overwriting. The audit log stores who, when and which field names changed, never values.

### Money rules (from HANDOFF.md, tested in `tests/finance.test.js`)

- Blank estimate = unpriced. Explicit 0 = priced. The total with reserve stays Pending while anything is unpriced.
- Only Confirmed ledger records count; confirmed refunds subtract; pending is reported separately. Duplicate transaction IDs or provider references (case- and space-insensitive) are rejected on entry and held for review in summaries. Event, type, kind, amount, status and receiver are required.
- Confirmed ledger rows are locked. Corrections are made by voiding with a new reason (logged with the prior status, amount and type) and recording a new transaction. Nothing is deleted.
- The funding gap uses net confirmed money received by the committee; provider-held fares are reported separately.
- Person balances count only Ticket, Deposit and Balance payments.
- Person balance is Pending without an agreed total. A refunded deposit shows a historical label.
- One booked cabin per unique, provider-confirmed Cabin ID. Duplicate IDs, over-capacity and unknown references are flagged.
- Sponsor commitments count only Committed and Paid. Prospects and declines are excluded; sponsor cash belongs in the ledger.
- Net receipts are not the committee bank balance.
- CSV exports prefix formula-like cells (`= + - @`) with an apostrophe.

## Import (review first)

Classmate records → "Import classmate records" (requires `crm.contact`). Choose or paste a CSV with `Alumni ID, First Name, Middle Name, Last Name, Graduation Year` (contact columns are optional). The server returns a preview: row errors, duplicate Alumni IDs in the file, IDs that already exist (skipped, never overwritten), and ignored columns. Apply is refused until every row is valid, and it requires an explicit confirmation. Each added record gets provenance (`<source label>, row N`); middle names go into the corrections log; an audit entry records the import. API: `POST /api/import/people/preview` and `/apply`.

Do not import the real 318-name roster into this local demo. It stays outside the project until shared storage and access are approved (see `references/PRIVATE-SOURCE.md`). Import for other collections (ledger from provider statements, for example) follows the same pattern and is not built yet.

## Assets

`/art/<file>` serves only the seven approved artworks. On start the server writes derivatives to `app/art/` with identical image data but without the PNG text/EXIF chunks (the originals embed an author name and generation prompts); `app/art/manifest.json` links each derivative to its original's SHA-256. The originals in `../assets/` are never modified and still match `references/source-manifest.json`. Crops are done with CSS. The originals are 1.2 to 2.7 MB PNGs; optimized web derivatives should be added before a public release, each linked to its original.

Fonts are self-hosted (see Operations below).

## Operations (for the real site)

| Command | What it does |
| --- | --- |
| `npm run migrate` | Applies database updates. Run with the database **owner's** `DATABASE_URL` before each deploy. `-- --status` lists them; `-- --down-to N --yes` undoes updates newer than N (undo steps are in `server/store/migrations/down/`). |
| `APP_DB_PASSWORD=… npm run db:app-role` | Creates or refreshes the restricted `mphs_app` database account. It can use everyday records, but it can't change or delete the audit history or alter tables. Re-run after every `migrate`. Run the app with this account and `MPHS_MIGRATIONS=skip`. |
| `npm run create-admin -- --email … --name "…" [--link-file path]` | Creates the first administrator and a one-time link (valid **24 hours**) to set their password. `--link-file` writes the link to a new, owner-only file instead of the console, so hosted console logs don't keep it. Running it again for an existing admin issues a new link; deactivated accounts are refused. Without `DATABASE_URL` it needs `--force` and a stopped server. |
| `npm run check:launch` | Checks the production settings and the database; exits 1 if anything blocks launch. The server runs the same check automatically when `NODE_ENV=production` and refuses to start on errors. Errors include: demo data on, no database, cookies not HTTPS-only, a non-https address, unencrypted database traffic, or demo records in the database. |
| `BACKUP_PASSPHRASE_FILE=… npm run backup` | Writes an encrypted backup (AES-256-GCM) of records, members, including password hashes, and the audit history, readable only by your account, as one consistent snapshot. The encryption settings are stored in the file and its header is authenticated. Sessions and open invite links are not included. Use `BACKUP_PASSPHRASE_FILE` (a file holding the passphrase) rather than `BACKUP_PASSPHRASE`, so the passphrase stays out of shell history. An existing file is never overwritten without `--force`. Keep the passphrase separate from the backups. |
| `BACKUP_PASSPHRASE_FILE=… npm run restore -- --in file --yes` | Restores into an **empty** database, then verifies the counts. |
| `npm run build:art` | Rebuilds the web-sized artwork in `app/art-web/` (macOS `sips`) from the metadata-stripped copies. The server warns at startup if an original changed and the web copies are stale. |

**Artwork.** Pages use `art-web/` copies: 960 px JPEGs for the paintings, 480 px for the gallery grid, and the seal as a 600 px or 96 px PNG. That's 3.3 MB in total, down from 12 MB, and roughly 100 KB per painting in the gallery. Each entry in `art-web/manifest.json` records the SHA-256 of its original in `../assets/`, which stays unmodified.

**Fonts** are served from `public/fonts/` (Latin subset, 320 KB). The site makes no requests to other domains, and the content security policy allows only the site itself. License files are in `fonts-licenses/`.

**How the server decides it is the real site.** It treats itself as production when `NODE_ENV` or `MPHS_ENV` is `production`, or whenever it looks hosted: an `https://` `PUBLIC_BASE_URL`, or listening beyond this machine. `MPHS_ENV=development` turns that off. Demo accounts and fictional records are created only for the local JSON store, or when `MPHS_DEMO_FIXTURES=1` on a non-production machine (the `dev:local` and `dev:oidc` scripts set this).

Outside the local demo, the server sets the demo flag itself and refuses `DEMO-` classmate IDs. After the first clean production start it records a `launched` marker; from then on, stray records are reported at startup but cannot block a restart.

**Database encryption.** `DATABASE_SSL=require` turns on TLS with certificate checks for the app and every script, and removes any `sslmode` from `DATABASE_URL` so it can't weaken this. `DATABASE_CA_CERT` can point at the provider's CA certificate.

**Restricted database account.** It can add audit entries but can't choose their timestamp or ID. Re-running `db:app-role` works for a database owner that isn't a superuser, the usual case on managed Postgres. Database update 3 also locks the note on confirmed ledger rows, except when voiding.
