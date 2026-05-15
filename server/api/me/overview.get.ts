// GET /api/me/overview — the dashboard / activity / settlements read model.
//
// Returns aggregated balances, suggested transfers, recent activity and a
// summary of every team the caller is in.  Pages can pass `?activityLimit=N`
// when they need a longer feed (defaults to 25).

import { buildUserOverview } from '../../services/user-overview'
import { requireUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const q = getQuery(event)
  const limit = clampInt(q.activityLimit, 25, 1, 200)
  return buildUserOverview({ userId: user.id, activityLimit: limit })
})

function clampInt(raw: unknown, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(String(raw ?? ''), 10)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, n))
}
