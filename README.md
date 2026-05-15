# BlueBirds Bill Splitter

A multi-tenant web app for teams to record shared expenses and see who-owes-whom in real time. Mobile-first, Vietnamese + English, built on Nuxt 4 + Postgres.

## What's in the app

| Area | What's in |
|---|---|
| **Foundation** | Nuxt 4 + Tailwind v4 + Nuxt UI v4 + `@nuxtjs/i18n` (vi/en, cookie-persistent across refreshes on every route). Drizzle schema, `postgres-js` driver. Pure `money`, `settlement`, `team-ledger` and `user-overview` services. Stable error envelope. Structured request logging with `request_id`. BigInt→JSON serialisation plugin. |
| **Auth** | Google OAuth via `nuxt-auth-utils` (single endpoint `/auth/google`). `users` upsert with idempotent refresh. `requireUser` / `requireTeamAccess` / `requireOwner` chokepoint. `auth.global.ts` middleware preserves `?redirect=`. Avatars render with `referrerpolicy="no-referrer"` to bypass Google's hotlink 403. |
| **Teams** | Create / list / get / patch / delete (owner-confirm by typing the team name). Members list / patch / soft-remove (refuses last owner). Ownership transfer via `PATCH /api/teams/:id/members/:id/role`. Invite tokens (32-byte base64url), accept with `INVALID_INVITE` / `ALREADY_MEMBER`. |
| **Bills (running ledger)** | Create / edit / delete bills that hang directly off a team — no billing cycles. Two split modes: **Equally** (server computes shares with remainder distribution) and **Exact** (caller supplies per-member amounts, server validates sum == total). Re-splitting on edit is transactional. `Idempotency-Key` honoured on POST. |
| **Settlements** | Ad-hoc record of a payment between two members ("A paid B 50k on the 12th"). No paid/unpaid toggle — recording IS the act of marking it paid; undo by deleting. Settlements reduce debt in the live balance computation. |
| **Balances** | Computed live from `(bills − bill_shares + settlements)` per request; no materialised cycle state to keep in sync. `team-ledger` service produces balances + minimised transfer suggestions; `user-overview` aggregates across all of a user's teams for the dashboard. |
| **UI** | 11 pages, mobile-first chrome (`/app/*` uses the sidebar + bottom-nav `app` layout; signed-out routes use the slim `default` layout). Reusable primitives: `BButton`, `BAvatar`, `MIcon`, `AppToast`, `BillFormDialog`, `PaymentRecordDialog`, `TeamNav`. `useMoney` and `useDates` mirror the server. |

### Out of scope per the spec

Bill receipts/photos, recurring bills, categories, comments, push/email, xlsx import/export, multi-currency, native mobile, audit-log UI.

---

## Setup

```bash
pnpm install
cp .env.example .env        # fill in NUXT_DATABASE_URL, OAuth client id/secret, session password
```

In Google Console, the authorised redirect URI is **`<NUXT_PUBLIC_BASE_URL>/auth/google`** (single endpoint, no `/callback`).

Local Postgres via Docker:

```bash
docker run --rm -d --name bb-pg -p 5432:5432 \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=postgres postgres:16
```

Apply migrations:

```bash
pnpm db:generate            # writes SQL to server/db/migrations/ (only when schema changes)
pnpm db:migrate             # applies pending migrations via scripts/migrate.mjs
```

> `db:migrate` calls drizzle-orm's migrator directly via `scripts/migrate.mjs` instead of `drizzle-kit migrate`, because the CLI's spinner swallows errors when stdout isn't a TTY (CI, log files), making failures look like silent timeouts.

## Develop

```bash
pnpm dev                    # http://localhost:3000
pnpm test                   # unit tests (no DB needed) — currently 69 passing
pnpm test:coverage          # with coverage report
pnpm typecheck              # full TS check across app/server/shared
```

## Try the full happy path

1. Sign in with Google → land on `/app` dashboard.
2. Create a team → land on its dashboard with the sidebar / bottom-nav.
3. Members tab → "Create invite" → open the URL in a private window with a second Google account → "Accept invite".
4. Sticky **+** FAB → add a bill (try `100k`, `1.2tr`, `12000` to see VND parsing). Pick **Equally** for a clean split or **Exact** to type each share — the live sum bar shows what's left over, with a "Distribute remaining" shortcut.
5. The team page shows live balances + suggested transfers; everything recomputes from the ledger on the fly.
6. Settlements page → record a payment from one member to another. Balances update immediately; delete the row to undo.
7. EN/VI toggle in the header — the choice rides a cookie and survives full-page reloads on every route.
8. Settings → rename / change defaults / Delete team (type the name to confirm).

## Project layout

```
app/
  pages/            # 11 file-based routes (landing, /app/**, /invite/:token)
  components/       # BButton, BAvatar, MIcon, AppToast, BillFormDialog,
                    #   PaymentRecordDialog, TeamNav
  composables/      # useApi, useMoney, useDates
  layouts/          # default (signed-out), app (signed-in shell)
  middleware/       # auth.global.ts (route guard for /app/**)
  assets/css/       # Tailwind + Nuxt UI v4 entry
server/
  api/              # team-scoped + flat bill/settlement endpoints
  routes/auth/      # OAuth handler at /auth/google
  db/               # schema.ts + client.ts + per-aggregate query modules
  services/         # money.ts, settlement.ts, team-ledger.ts, user-overview.ts (pure)
  utils/            # auth.ts, errors.ts, idempotency.ts, invite-tokens.ts
  plugins/          # logging.ts (request_id + JSON in prod), bigint-json.ts
shared/             # currency.ts (CURRENCY_META), schemas.ts (Zod)
i18n/locales/       # en.json, vi.json
tests/unit/         # money, settlement, errors, invite-tokens, schemas
scripts/            # migrate.mjs (reliable wrapper around drizzle-orm migrator)
docs/superpowers/   # spec + plans
auth.d.ts           # nuxt-auth-utils session type augmentation
```

## Key conventions

- All monetary amounts are `bigint` integer minor units. Conversion to display strings happens only in `server/services/money.ts` and its mirror in `app/composables/useMoney.ts`.
- BigInts cross the wire as **JSON strings** (see `server/plugins/bigint-json.ts`); client code accepts `bigint | string | number` and converts as needed.
- Balances are **never persisted** — the team-ledger service derives them on every request from `(bills − bill_shares + settlements)`. Removing or editing any input immediately changes the balance everyone sees.
- Bill splits take exactly one of `participantMemberIds` (equal split, server computes shares with the leading-N-get-+1 remainder rule) or `participantShares` (exact split, server validates uniqueness, positivity, and `Σshares == total` before persisting).
- `server/db/*` is the only place that touches Drizzle. Other modules take and return plain objects.
- Authorisation goes through `server/utils/auth.ts` — every team-scoped handler calls `requireTeamAccess(event, teamId)` at the top. Owner-only routes additionally call `requireOwner(member)`.
- Errors thrown via `createApiError(code, message?, details?)` flow through the global error handler as `{ error: { code, message, details? } }` and map to localised messages on the client under `errors.<CODE>`.
- The session payload is intentionally minimal (`user.id` + display fields). Memberships are re-fetched per request — never cached in the cookie.
- Bill `currency` is snapshotted at write time, so flipping a team's default currency only affects future bills, not historical ones.

## Deployment

Canonical hosted target is **Vercel + Neon** — see [`DEPLOY.md`](DEPLOY.md) for the full walkthrough (env vars, redirect URI, migration command). The Nitro preset auto-switches to `vercel` when `VERCEL=1` is set, and `server/db/client.ts` auto-switches the Drizzle driver from `postgres-js` to `@neondatabase/serverless` Pool (WebSocket) so serverless functions don't hold a TCP pool open across invocations. WS is required — not HTTP — because writes (bill / settlement transactions) use `db.transaction()`.

For Node-preset hosts (Render / Fly / Railway / VPS): set `NITRO_PRESET=node-server` at build time and keep using `postgres-js` against any Postgres (including Neon over TCP — the same `NUXT_DATABASE_URL` works for both drivers). Override the driver explicitly with `NUXT_DB_DRIVER=postgres-js | neon-serverless` if auto-detection picks wrong.

Per-deploy: run `pnpm db:migrate` against the production `NUXT_DATABASE_URL`. Migrations are idempotent (`drizzle.__drizzle_migrations` tracks what's applied). 
