// Single chokepoint for Drizzle. Everything else takes plain objects.
//
// We pick the driver at runtime based on environment:
//
//   - **Vercel (serverless functions):** `@neondatabase/serverless` Pool over
//     WebSocket + Drizzle's `neon-serverless` adapter.  Important: we *cannot*
//     use the `neon-http` adapter here because the cycle-close path (and 6
//     others, see `server/db/`) relies on `db.transaction()`, which HTTP can't
//     express.  WebSocket sessions can, at the cost of one extra round-trip on
//     cold start.  Worth it.
//
//   - **Local dev / long-lived Node servers:** plain `postgres-js`.  It pools
//     properly when there's actually a process to pool against, and we don't
//     need WS overhead.
//
// Driver selection order:
//   1. NUXT_DB_DRIVER=neon-serverless | postgres-js   (explicit override)
//   2. process.env.VERCEL is set                       → neon-serverless
//   3. URL host ends in `.neon.tech`                   → neon-serverless
//   4. otherwise                                        → postgres-js
//
// Both adapters share the same Drizzle schema, so query code is identical
// regardless of transport.

import { Pool } from '@neondatabase/serverless'
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless'
import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

// `neonConfig` is re-exported below for callers that want to tweak runtime WS
// behaviour (e.g. inject `ws` for local Node testing of the WS path).  Using
// `export ... from` here instead of the import-then-export form silences a
// Vite warning that flags the re-export as an unused import in this file.
export { neonConfig } from '@neondatabase/serverless'
export { schema }

type Db =
  | ReturnType<typeof drizzleNeon<typeof schema>>
  | ReturnType<typeof drizzlePg<typeof schema>>

let _db: Db | null = null

export function useDb(): Db {
  if (_db) return _db

  const url = useRuntimeConfig().databaseUrl
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env and configure it.',
    )
  }

  if (pickDriver(url) === 'neon-serverless') {
    // The Neon WS driver ships with sensible defaults for serverless; we leave
    // pipelineConnect=true so cold starts pipeline auth and the first query.
    // `pipelineTLS` defaults to true and is fine.
    const pool = new Pool({ connectionString: url })
    _db = drizzleNeon(pool, { schema })
  } else {
    // `prepare: false` keeps things working on PgBouncer-style pooling that
    // strips named prepared statements; the latency cost is small and the
    // operational simplicity is worth it.
    const client = postgres(url, { prepare: false, max: 10 })
    _db = drizzlePg(client, { schema })
  }

  return _db
}

function pickDriver(url: string): 'neon-serverless' | 'postgres-js' {
  const override = process.env.NUXT_DB_DRIVER
  if (override === 'neon-serverless' || override === 'postgres-js') return override
  if (process.env.VERCEL) return 'neon-serverless'
  try {
    const host = new URL(url).host
    if (host.endsWith('.neon.tech')) return 'neon-serverless'
  } catch {
    // Malformed URL — fall through; the driver will surface a clearer error.
  }
  return 'postgres-js'
}

