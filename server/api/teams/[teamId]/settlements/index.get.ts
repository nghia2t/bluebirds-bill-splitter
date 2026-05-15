// GET /api/teams/:teamId/settlements — list every recorded payment.

import { uuidSchema } from '../../../../../shared/schemas'
import { listSettlementsForTeam } from '../../../../db/settlements'
import { requireTeamAccess } from '../../../../utils/auth'
import { createApiError } from '../../../../utils/errors'

export default defineEventHandler(async (event) => {
  const teamId = getRouterParam(event, 'teamId') ?? ''
  if (!uuidSchema.safeParse(teamId).success) throw createApiError('NOT_FOUND')

  await requireTeamAccess(event, teamId)
  const settlements = await listSettlementsForTeam(teamId)
  return { settlements }
})
