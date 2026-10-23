# Finchmail

Finchmail is a self-hosted, single-user, browser-based email client. It connects to custom IMAP/SMTP servers, stores a searchable local copy of message content in PostgreSQL, and keeps IMAP as the source of truth.

## Run the UI locally

Requires Node.js 20 or newer.

```sh
npm install
npm run dev
```

Open <http://localhost:3000>. On first launch, create the owner login using the one-time setup token and connect an IMAP/SMTP account. Finchmail verifies both servers before it stores encrypted credentials. IMAP synchronization is read-only: stars and read/unread overrides are local to Finchmail and do not change flags on the provider yet. Sending, moving, archiving, trashing, and attachment downloads are not implemented yet. Use Docker Compose or set up PostgreSQL and the `.env` secrets for local development—the mailbox UI requires a database.

## Server deployment scaffold

The Compose file publishes the web service only on `127.0.0.1:3000`, intended to sit behind your existing HTTPS reverse proxy.

```sh
cp .env.example .env
# Edit .env: set strong POSTGRES_PASSWORD, matching DATABASE_URL, APP_ENCRYPTION_KEY, and INITIAL_SETUP_TOKEN.
docker compose up --build -d
```

Generate an encryption key with `openssl rand -hex 32` and the one-time owner-setup token with `openssl rand -base64 36`. Keep both secrets out of source control. Back up the `finchmail-db` volume and keep the encryption key separately; without it, stored mail-server credentials cannot be decrypted. `SESSION_COOKIE_DOMAIN` is optional and should normally be left blank, which uses a host-only session cookie.

The first browser visit creates the only owner account, gated by the `INITIAL_SETUP_TOKEN` set in `.env`; use that one-time token and a strong password of at least 12 characters. Account setup asks for IMAP and SMTP hostname, port, TLS mode, username, and password/app password. Use implicit TLS ports (commonly IMAP 993 and SMTP 465), or select STARTTLS as required by your provider. By default, mail hosts must resolve to public IP addresses; for a trusted LAN/VPN mail server, explicitly set `ALLOW_PRIVATE_MAIL_HOSTS=true`. The app and worker are separate services; the worker syncs periodically and can also be triggered with the refresh button.

The first 90 days are indexed first in small batches; older messages are backfilled afterward. Search covers subject, sender, and message bodies, and supports date filters. The worker uses a separate queue container. Set `ARGON2_MEMORY_COST` to a higher value on machines with sufficient memory. Local development runs `prisma generate` before starting the app or worker.

For local development with PostgreSQL running separately, set `DATABASE_URL`, `APP_ENCRYPTION_KEY`, a long `INITIAL_SETUP_TOKEN`, and `NODE_ENV=development`, then run:

```sh
npx prisma migrate deploy
npm run dev
```

In another terminal, run `npm run worker` for mailbox synchronization.

## Current status

- [x] Responsive web UI and mobile navigation
- [x] Single-owner setup, Argon2id password hash, database-backed secure sessions
- [x] Encrypted IMAP/SMTP credentials and server connectivity tests
- [x] Read-only IMAP sync worker with UIDVALIDITY tracking, bounded recent-first indexing, and periodic sync
- [x] Local PostgreSQL full-text search and sanitized HTML rendering
- [x] Docker Compose app, worker, PostgreSQL, and migration startup
- [ ] SMTP sending, drafts, attachment retrieval, and synchronized move/delete actions

Run `npm test` to exercise credential encryption, mail utilities, setup validation, account validation, and migration essentials.

Before exposing Finchmail, put it behind HTTPS, use unique strong database and owner passwords, keep the encryption key out of the database and source control, and configure regular database backups. The current app intentionally does not expose message actions that mutate IMAP folders; SMTP sending and attachment retrieval are not implemented yet.
