// Helper for write endpoints that want Idempotency-Key support.
//
//   const result = await withIdempotency(event, 'POST /api/cycles/:cycleId/bills',
//     userId, async () => createBill(...))
//
// If the client sends `Idempotency-Key`, we look up the cached response and
// return it without re-executing the action.  Otherwise we run the action,
// store the response, and return it.  We deliberately do NOT serialise the
// JSON twice — the body is whatever the action returns and is JSON.stringify'd
// only when stored.

import type { H3Event } from 'h3'
import { findIdempotentResponse, storeIdempotentResponse } from '../db/idempotency'

export async function withIdempotency<T>(
  event: H3Event,
  endpoint: string,
  userId: string,
  action: () => Promise<T>,
): Promise<T> {
  const key = getHeader(event, 'idempotency-key')
  if (!key) return action()

  const replay = await findIdempotentResponse(key, endpoint, userId)
  if (replay !== null) return replay as T

  const result = await action()
  // Best-effort store; collision (same key inserted concurrently) → ignore.
  try {
    await storeIdempotentResponse({ key, endpoint, userId, body: serialiseBigints(result) })
  } catch {
    // Concurrent insert with same key — the other side won the race; that's fine.
  }
  return result
}

// JSONB column doesn't accept bigints; convert to strings for storage. The
// caller is responsible for converting back if it actually needs bigints in
// the replayed response.
function serialiseBigints(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (_k, v) =>
    typeof v === 'bigint' ? v.toString() : v))
}
