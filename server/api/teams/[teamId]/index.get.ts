// GET /api/teams/:teamId — team details + the caller's membership row, so the
// client can branch on role without a second request.

import { uuidSchema } from '../../../../shared/schemas'
import { getTeamById } from '../../../db/teams'
import { requireTeamAccess } from '../../../utils/auth'
import { createApiError } from '../../../utils/errors'

export default defineEventHandler(async (event) => {
  const teamId = getRouterParam(event, 'teamId') ?? ''
  if (!uuidSchema.safeParse(teamId).success) throw createApiError('NOT_FOUND')

  const { member } = await requireTeamAccess(event, teamId)
  const team = await getTeamById(teamId)
  if (!team) throw createApiError('NOT_FOUND')
  return { team, member }
})
