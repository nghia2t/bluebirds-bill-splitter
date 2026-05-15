// Idempotency-key storage.  POSTs that mutate state (currently bill creation
// and cycle close) accept an `Idempotency-Key` header; we store the response
// body for 24h and return it verbatim on retry.

import { eq, lt } from 'drizzle-orm'
import { useDb } from './client'
import { idempotencyKeys, type User } from './schema'

const TTL_MS = 24 * 60 * 60 * 1000

export async function findIdempotentResponse(
  key: string,
  endpoint: string,
  userId: User['id'],
): Promise<unknown | null> {
  const db = useDb()
  const row = await db.query.idempotencyKeys.findFirst({
    where: eq(idempotencyKeys.key, key),
  })
  if (!row) return null
  // Same key, different endpoint or different user → treat as a collision and
  // refuse to replay (callers should pick non-colliding keys).
  if (row.endpoint !== endpoint) return null
  if (row.userId !== userId) return null
  if (Date.now() - row.createdAt.getTime() > TTL_MS) {
    // Stale; let the caller retry as a fresh write.
    await db.delete(idempotencyKeys).where(eq(idempotencyKeys.key, key))
    return null
  }
  return row.responseBody
}

export async function storeIdempotentResponse(args: {
  key: string
  endpoint: string
  userId: User['id']
  body: unknown
}): Promise<void> {
  const db = useDb()
  await db.insert(idempotencyKeys).values({
    key: args.key,
    endpoint: args.endpoint,
    userId: args.userId,
    responseBody: args.body as object,
  })
}

/** Garbage-collect expired entries.  Call from a scheduled job later. */
export async function purgeExpiredKeys(): Promise<number> {
  const db = useDb()
  const cutoff = new Date(Date.now() - TTL_MS)
  const deleted = await db.delete(idempotencyKeys).where(lt(idempotencyKeys.createdAt, cutoff)).returning()
  return deleted.length
}
