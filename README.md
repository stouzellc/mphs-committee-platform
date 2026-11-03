# MPHS Class of 2008 · committee platform

A private planning platform built for a real client: a high school reunion committee planning a 20-year reunion (*Back to Pleasant*) and a possible class cruise (*Pleasant, Beyond the Shore*) side by side.

Case study: **[esaie-touze.pages.dev](https://esaie-touze.pages.dev/project.html?p=mphs-class-of-2008)**

> **Demo code only.** Everything in this repository runs on fictional demo data. The real classmate list, contact details and money records never entered the repository, and committee members other than the owner are not named.

## What it does

- **Private sign-in** with personal invite links. No public sign-up.
- **Roles checked on the server** for every request: classmate, organizer, treasurer, admin. Hiding a menu is never treated as access control.
- **Organizer workspace:** budgets, sponsors, vendor quotes, tasks, decisions, run of show, merchandise, communications and closeout.
- **One money ledger** for confirmed payments and refunds, kept apart from pledges, estimates and bank balances.
- **Pending, never guessed:** unknown figures stay marked Pending, and every budget line points to its source.
- **Two illustrated event stories**, each with a keyboard presentation mode for committee meetings.
- **Photo and memory uploads**, reviewed by an organizer before anything is shown.
- **Safe roster import**, rehearsed on fictional rosters (`app/samples/`) before the real list.
- **Backups and restore**, migrations with down-steps, and a launch check that refuses to start with unsafe settings.

## Tests

```bash
cd app
npm install
npm test        # 131 passing on the JSON store; 17 Postgres-only tests skip
npm run test:pg # adds database-level tests against a throwaway local Postgres
```

Covered: money rules, access and field redaction, sign-in and sessions, invites, uploads, imports, exports, edit conflicts, backups and the launch check.

## Stack

Node.js (no framework), PostgreSQL via `pg`, plain HTML/CSS/JavaScript with no build step, scrypt password hashing, server-side sessions. Deployment prepared for Render (app) and Neon (Postgres) in `render.yaml`; not launched yet, pending the client's go-ahead.

See [`app/README.md`](app/README.md) for routes, architecture and every script.

## How it was built

Product ownership, requirements, access rules and every review by Esaie Touze; built with Claude Code. Event artwork was generated with Midjourney under the committee's direction and is illustration, not archival photography.

© 2026 Esaie Touze. Shared for review; please ask before reusing.
