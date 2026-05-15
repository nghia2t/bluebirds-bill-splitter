// GET /api/teams/:teamId/members — list active members.

import { uuidSchema } from '../../../../../shared/schemas'
import { listActiveMembers } from '../../../../db/teams'
import { requireTeamAccess } from '../../../../utils/auth'
import { createApiError } from '../../../../utils/errors'

export default defineEventHandler(async (event) => {
  const teamId = getRouterParam(event, 'teamId') ?? ''
  if (!uuidSchema.safeParse(teamId).success) throw createApiError('NOT_FOUND')

  await requireTeamAccess(event, teamId)
  const members = await listActiveMembers(teamId)
  return { members }
})
