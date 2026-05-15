# Deploy: Vercel + Neon

This is the canonical hosted setup. The app autodetects the Vercel runtime and
swaps the Drizzle driver from `postgres-js` (long-lived TCP pool) to
`@neondatabase/serverless` Pool over WebSocket. WS is required — not the HTTP
flavour — because cycle-close and several other paths run inside
`db.transaction()`, which the HTTP-only adapter can't express.

## One-time

### Neon

1. Sign up at <https://neon.tech>, create a project. Pick the region closest to
   your Vercel region — `ap-southeast-1` (Singapore) pairs well with Vercel
   `sin1`.
2. In the Neon console → **Connection Details** → copy the **Pooled connection**
   string. It looks like:

   ```
   postgresql://USER:PASSWORD@ep-xxxxxx-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```

   The `-pooler` host is what the Neon WS driver wants.
3. Apply the schema **once**, from your machine, pointing at Neon:

   ```bash
   NUXT_DATABASE_URL='postgresql://…neon.tech/neondb?sslmode=require' \
     pnpm db:migrate
   ```

   (The migrator uses `postgres-js` over TCP, which Neon also accepts on the
   same URL. Subsequent app traffic goes over WebSocket from Vercel.)

### Google OAuth

In <https://console.cloud.google.com> → APIs & Services → Credentials, add the
production redirect URI:

```
https://<your-vercel-domain>/auth/google
```

Keep `http://localhost:3000/auth/google` for local dev.

### Vercel

1. Import the repo at <https://vercel.com/new>. Framework preset will say
   **Nuxt.js** (matched by `vercel.json`).
2. Add Environment Variables (Production + Preview):

   | Name | Value |
   |---|---|
   | `NUXT_DATABASE_URL` | Neon pooled connection string |
   | `NUXT_OAUTH_GOOGLE_CLIENT_ID` | from Google Console |
   | `NUXT_OAUTH_GOOGLE_CLIENT_SECRET` | from Google Console |
   | `NUXT_SESSION_PASSWORD` | `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
   | `NUXT_PUBLIC_BASE_URL` | `https://<your-vercel-domain>` |

3. Deploy. Vercel runs `pnpm build`, which produces `.vercel/output/` via the
   Nitro `vercel` preset.

That's it — no `vercel-build` script, no extra config. The `nitro.preset` line
in `nuxt.config.ts` honours `process.env.VERCEL` automatically.

## After each schema change

```bash
pnpm db:generate     # writes new SQL into server/db/migrations/
git commit -am '…'
NUXT_DATABASE_URL='postgresql://…neon.tech/neondb?sslmode=require' \
  pnpm db:migrate    # apply to prod
git push             # then Vercel redeploys the app
```

The migrator is idempotent (`drizzle.__drizzle_migrations` records what's
applied), so running it twice is safe.

## Switching off the Neon WS driver

If you ever point the same deploy at a non-Neon Postgres, set:

```
NUXT_DB_DRIVER=postgres-js
```

The client respects that override regardless of `VERCEL` / `.neon.tech` host
detection. See `server/db/client.ts` for the full precedence order.

## Forcing a non-Vercel preset locally

`pnpm build` on your machine will use whatever Nitro auto-detects (Node by
default). To preview the Vercel bundle locally:

```bash
NITRO_PRESET=vercel pnpm build
```

Output lands in `.vercel/output/` — same shape Vercel deploys.
