// GET /api/teams — list teams the caller is an active member of.

import { listTeamsForUser } from '../../db/teams'
import { requireUser } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const teams = await listTeamsForUser(user.id)
  return { teams }
})
