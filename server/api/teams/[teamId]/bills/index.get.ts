// GET /api/teams/:teamId/bills — list every bill on the team with participants.

import { uuidSchema } from '../../../../../shared/schemas'
import { listBillsForTeam } from '../../../../db/bills'
import { requireTeamAccess } from '../../../../utils/auth'
import { createApiError } from '../../../../utils/errors'

export default defineEventHandler(async (event) => {
  const teamId = getRouterParam(event, 'teamId') ?? ''
  if (!uuidSchema.safeParse(teamId).success) throw createApiError('NOT_FOUND')

  await requireTeamAccess(event, teamId)
  const bills = await listBillsForTeam(teamId)
  return { bills }
})
