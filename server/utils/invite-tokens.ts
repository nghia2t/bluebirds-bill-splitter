// Invite token generation.  32 random bytes encoded base64url gives 43 chars
// of unpredictable token — about 256 bits of entropy, which is comfortably
// past brute-force range over our rate-limit budget.
//
// The token IS the bearer credential. Treat it as a secret in URLs (HTTPS only,
// don't log full tokens) but it's safe to store the raw token in the DB —
// guessing remains computationally infeasible.

import { randomBytes } from 'node:crypto'

export function generateInviteToken(): string {
  return randomBytes(32).toString('base64url')
}

export function isWellFormedToken(value: unknown): value is string {
  if (typeof value !== 'string') return false
  // 32 bytes → 43 base64url chars (no padding).  Reject the wrong shape early
  // so token-guessing attempts get a cheap 410 instead of a DB query.
  return /^[A-Za-z0-9_-]{43}$/.test(value)
}
