# Diätendeckel jetzt

Campaign landing page for an open letter by the base of Die Linke demanding caps on parliamentary salaries. Collects verified signatures with email confirmation and displays them publicly.

## Stack

- **Runtime**: [Bun](https://bun.sh) — package manager, bundler, HTTP server (no Vite, no framework)
- **Frontend**: React 18, vanilla CSS
- **Backend**: `Bun.serve()` with route handlers
- **Database**: SQLite via Bun's built-in `bun:sqlite`, **encrypted at rest with [SQLCipher](https://www.zetetic.net/sqlcipher/)** (loaded through `Database.setCustomSQLite`)
- **Jobs**: [Honker](https://honker.dev) durable queues + cron scheduler (campaign sends, zoom mailings, backups, state resolution) — persisted inside the same SQLite file
- **Email**: Resend HTTP API for transactional mail

## Project Structure

```
diaetendeckel/
├── package.json
├── index.html                 # HTML entry (Bun auto-bundles JS + CSS)
├── .env.example
├── .gitignore
├── Dockerfile                 # Production multi-stage build
├── Dockerfile.dev             # Dev/demo build (includes seed + trickle)
├── .dockerignore
├── docker-compose.yml         # Production (encrypted SQLite on a volume)
├── docker-compose.dev.yml     # Dev/demo (SQLite + seed data + trickle)
├── db/
│   ├── connection.js          # Shared SQLCipher-keyed bun:sqlite connection
│   ├── schema.sql             # Tables + indexes (SQLite)
│   ├── setup.js               # Idempotent schema application
│   ├── seed.js                # Dev: 200 demo signers + live trickle
│   ├── jobs.js                # Honker durable queues + scheduler (encrypted DB)
│   ├── migrate-pg-to-sqlite.js # One-time Postgres → encrypted SQLite migration
│   └── restore-backup.js      # Restore an encrypted backup into DATABASE_PATH
├── server/
│   ├── index.js               # Bun.serve() — routes + security headers
│   ├── db.js                  # Parameterized bun:sqlite queries
│   ├── email.js               # Email templates + Resend transport
│   └── ratelimit.js           # In-memory sliding window rate limiter
└── src/
    ├── main.jsx               # React entry point
    ├── App.jsx                # Full SPA — all sections + modals
    └── index.css              # All styles + responsive breakpoints
```

## Quick Start (local)

Prerequisites: [Bun](https://bun.sh) installed, SQLCipher installed
(`brew install sqlcipher` on macOS, `apt-get install libsqlcipher0` on Debian).

```bash
git clone <repo-url> && cd diaetendeckel
bun install
cp .env.example .env           # set DATABASE_ENCRYPTION_KEY (required)
bun run db:setup               # create tables + indexes (idempotent)
bun run dev                    # → http://localhost:3000 (HMR enabled)
```

The database is encrypted at rest with SQLCipher. `DATABASE_ENCRYPTION_KEY` is
**required** — the app refuses to start without it. If `libsqlcipher` is not on
the default path, set `SQLCIPHER_LIB`.

To populate with demo data in a second terminal:

```bash
bun run db:seed                # seeds 200 signers, then trickles 1 every 6s
```

## Quick Start (Docker — demo with sample data)

No local Bun or Postgres needed:

```bash
docker compose -f docker-compose.dev.yml up --build
```

This creates the encrypted SQLite database, seeds 200 verified signers, trickles a new one every 6 seconds, and serves the app at `http://localhost:3000`.

## Environment Variables

| Variable           | Required   | Default                 | Description                                                                                                           |
| ------------------ | ---------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_PATH`    | No         | `./data/diaetendeckel.db` | Path to the encrypted SQLite database file                                                                          |
| `DATABASE_ENCRYPTION_KEY` | Yes | —                       | SQLCipher passphrase. The app fails closed (won't start) without it.                                                 |
| `SQLCIPHER_LIB`    | No         | platform default        | Path to `libsqlcipher` (`.dylib`/`.so`) loaded via `setCustomSQLite`                                                 |
| `HONKER_EXTENSION_PATH` | No    | platform default        | Path to the Honker SQLite extension (`libhonker_ext.{dylib,so}`) for durable jobs                                    |
| `SOURCE_DATABASE_URL` | Migration only | —                | Old Postgres connection string, read by `db:migrate`                                                                |
| `PORT`             | No         | `3000`                  | Server port                                                                                                           |
| `BASE_URL`         | No         | `http://localhost:3000` | Public URL (used in verification emails)                                                                              |
| `NODE_ENV`         | No         | `development`           | `production` enables CSP headers + asset minification                                                                 |
| `ADMIN_PATH`       | Yes        | —                       | Secret single-segment admin path, without leading or trailing slashes. Use `my-secret-panel`, not `/my-secret-panel`. |
| `ADMIN_PASSWORD`   | Yes        | —                       | Admin login password                                                                                                  |
| `ADMIN_JWT_SECRET` | Yes        | —                       | Long random secret for admin session JWTs                                                                             |
| `RESEND_API_KEY`   | Yes (prod) | —                       | Resend API key used to send transactional email                                                                       |
| `RESEND_FROM`      | No         | `Gehaltsdeckel Initiative <noreply@gehaltsdeckel.jetzt>` | Verified sender used for outbound email                                                  |
| `BACKUP_ENCRYPTION_KEY` | No    | `DATABASE_ENCRYPTION_KEY` | Separate SQLCipher key for backup files. Defaults to the live DB key.                                              |
| `BACKUP_DIR`       | No         | `/app/backups`          | Directory for database backup files                                                                                   |
| `BACKUP_KEEP`      | No         | `48`                    | Number of hourly backup files to retain                                                                               |
| `BACKUP_GZIP`      | No         | `true`                  | Gzip the encrypted backup snapshot                                                                                    |

See `.env.example` for a template.

## Scripts

| Command            | Description                                       |
| ------------------ | ------------------------------------------------- |
| `bun run dev`      | Start dev server with watch mode + HMR            |
| `bun run start`    | Start production server                           |
| `bun run db:setup` | Apply database schema (idempotent)                |
| `bun run db:seed`  | Seed 200 demo signers + trickle new ones every 6s |
| `bun run db:migrate` | One-time migrate from Postgres (`SOURCE_DATABASE_URL`) into encrypted SQLite |
| `bun run db:restore <file\|--latest>` | Restore an encrypted backup into `DATABASE_PATH` |

## API

| Method | Path                              | Description                                              |
| ------ | --------------------------------- | -------------------------------------------------------- |
| `GET`  | `/api/health`                     | Health check — `{ok, db}`, returns 503 if DB unreachable |
| `GET`  | `/api/stats`                      | Signature totals — `{total, today, week, kvCount}`       |
| `GET`  | `/api/signers`                    | Verified signers list (paginated, filterable)            |
| `POST` | `/api/sign`                       | Submit a signature — triggers verification email         |
| `GET`  | `/api/confirm/:token`             | Email confirmation link — verifies + redirects           |
| `GET`  | `/api/unsubscribe/:token`         | Newsletter unsubscribe state                             |
| `POST` | `/api/unsubscribe/:token/opt-out` | Opt out of newsletter emails                             |
| `POST` | `/api/unsubscribe/:token/delete`  | Delete signature from a newsletter link                  |

### POST /api/sign

```json
{
  "name": "Anna Berger",
  "email": "anna@example.org",
  "kv": "Berlin-Neukölln",
  "newsletter": true
}
```

- Rate limited: 3 requests per IP per 15 minutes (429 with `Retry-After` header)
- Validates: name >= 2 chars, valid email format
- Sanitizes all inputs (trim, strip HTML, length cap)
- Generates a UUID token with 24h expiry
- Sends verification email through Resend
- Returns `{ok: true}` regardless of whether the email already exists (no information leakage)

### GET /api/signers

| Param    | Default | Description                                          |
| -------- | ------- | ---------------------------------------------------- |
| `filter` | `alle`  | `alle`, `heute` (last 24h), `kv` (with Kreisverband) |
| `search` | —       | Search by name or Kreisverband                       |
| `limit`  | `18`    | Results per page (max 100)                           |
| `offset` | `0`     | Pagination offset                                    |

Returns `{signers: [{id, name, kreisverband, created_at}], total}`. Email addresses are never exposed.

### GET /api/confirm/:token

Verifies a signature if the token is valid and not expired. Redirects to `/?confirmed=1` on success, `/?error=token-expired` on failure.

## Database

SQLite, encrypted at rest with SQLCipher. `bun:sqlite` loads `libsqlcipher` via
`Database.setCustomSQLite()` and applies `PRAGMA key` as the first statement on
every connection; the app verifies `PRAGMA cipher_version` is active and fails
closed otherwise. The file, its WAL, and all backups are encrypted.

Core table `signers` (`id`, `name`, `email` unique, `kreisverband`, `occupation`,
`state`, `newsletter`, `show_publicly`, `verified`, token columns, `created_at`),
plus `email_templates`, `campaigns` (with `audience` + JSON `recipient_ids`),
`zoom_registrations`, `zoom_event_mailings`, `app_settings`, and the
KV/state-resolution caches.

Conventions: timestamps are ISO-8601 UTC `TEXT`; booleans are `0/1`. Schema
creation is idempotent (`IF NOT EXISTS`) — safe to run on every container start.

### Migrating from Postgres (zero data loss)

```bash
SOURCE_DATABASE_URL=postgres://…  DATABASE_PATH=/app/data/diaetendeckel.db \
DATABASE_ENCRYPTION_KEY=…  bun run db:migrate
```

Copies every table preserving primary-key ids, converting booleans, timestamps,
and the `recipient_ids` array, then prints per-table source vs destination row
counts and aborts on any mismatch. Run it during a brief maintenance window with
the app stopped, then start the app pointed at the new file.

## Email

**Dev/demo:** Set `RESEND_API_KEY` to test real email delivery through Resend. Without an API key, development starts but email submission will fail when a route tries to send mail.

**Production:** `RESEND_API_KEY` is required. The app sends directly to Resend's Email API; SMTP, mailbox.org, and Haraka are not part of the production mail path. See `resend-email-setup.txt` for the Resend domain verification and deployment setup.

## Security

- **Headers**: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`. In production: `Content-Security-Policy` restricting sources to `'self'` + Google Fonts.
- **Rate limiting**: In-memory sliding window, 3 sign requests per IP per 15 minutes.
- **Input sanitization**: All text trimmed, HTML tags stripped, lengths capped. Parameterized SQL queries throughout.
- **Token security**: `crypto.randomUUID()` (128-bit), 24h expiry, cleared after use.
- **No email exposure**: `/api/signers` never returns email addresses. `/api/sign` returns the same response whether the email exists or not.

## Durable jobs (Honker)

Background work — scheduled **campaign sends**, **zoom event mailings**, and
**hourly backups** — runs on durable [Honker](https://honker.dev) queues instead
of in-memory timers. The Honker SQLite extension is loaded into the app's
SQLCipher-keyed connection and driven via its `honker_*` SQL functions, so job
rows live inside the **same encrypted database** (encrypted at rest) and survive
restarts, with automatic retries and dead-lettering.

- Creating a campaign enqueues a `campaigns` job delivered at its scheduled time;
  a reconciler re-enqueues any due/failed campaign so sends survive restarts.
- A cron scheduler fires the zoom-mailing check (every 60s) and the hourly backup.
- The extension binary is **not on npm** — build it from the
  [Honker repo](https://github.com/russellromney/honker)
  (`cargo build --release -p honker-extension`) and point `HONKER_EXTENSION_PATH`
  at the resulting `libhonker_ext.{dylib,so}`. The Docker images build it in a
  Rust stage automatically.

## Backups

Hourly backups write a consistent, SQLCipher-encrypted snapshot to `BACKUP_DIR`
(default `/app/backups`), keeping the most recent `BACKUP_KEEP` files (default
48). Each snapshot is produced via SQLCipher's `sqlcipher_export()` into an
ATTACHed keyed file, then gzipped (`.sqlite.gz`). Because the snapshot is itself
SQLCipher-encrypted, backups are encrypted at rest with no extra step.

By default backups use `DATABASE_ENCRYPTION_KEY`; set `BACKUP_ENCRYPTION_KEY` to
use a distinct key. **Store the key securely and separately from the backups** —
without it, a backup cannot be opened.

### Restoring a backup

```bash
# Restore the most recent backup (app stopped) — moves any existing DB aside
# to <path>.pre-restore-<timestamp> first, then verifies row counts.
DATABASE_PATH=/app/data/diaetendeckel.db DATABASE_ENCRYPTION_KEY=… \
  bun run db:restore --latest

# Or a specific file:
bun run db:restore /app/backups/backup-2026-06-09T12-00-00.sqlite.gz
```

The restore re-keys the snapshot to `DATABASE_ENCRYPTION_KEY`, so it works even
if the backup used a separate `BACKUP_ENCRYPTION_KEY`.

## Deployment (Dokploy)

The database is a single encrypted SQLite file on a persistent volume — there is
no separate database service.

### Production

```bash
docker compose up --build
```

Set in Dokploy UI or `.env`:

- `DATABASE_ENCRYPTION_KEY` — SQLCipher key (required). Generate: `openssl rand -hex 32`
- `BASE_URL` — public URL (e.g. `https://diaetendeckel.example.de`)
- `RESEND_API_KEY` — Resend API key with send access
- `RESEND_FROM` — optional verified sender override

The `data` volume holds `diaetendeckel.db`; the `backups` volume holds the hourly
encrypted snapshots. Back up the key separately from both.

### Dev / Demo

```bash
docker compose -f docker-compose.dev.yml up --build
```

Includes Postgres, auto-seeds 200 signers, and trickles new ones every 6 seconds. Default DB password: `devpass`.

In all cases, the app runs `db/setup.js` on startup to ensure the schema exists. Health check at `/api/health` confirms DB connectivity.
