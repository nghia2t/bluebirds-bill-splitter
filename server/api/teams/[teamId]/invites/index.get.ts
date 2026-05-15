// GET /api/teams/:teamId/invites — owner-only list of active invites.

import { uuidSchema } from '../../../../../shared/schemas'
import { listActiveInvites } from '../../../../db/invites'
import { requireOwner, requireTeamAccess } from '../../../../utils/auth'
import { createApiError } from '../../../../utils/errors'

export default defineEventHandler(async (event) => {
  const teamId = getRouterParam(event, 'teamId') ?? ''
  if (!uuidSchema.safeParse(teamId).success) throw createApiError('NOT_FOUND')

  const { member } = await requireTeamAccess(event, teamId)
  requireOwner(member)
  const invites = await listActiveInvites(teamId)
  return { invites }
})
