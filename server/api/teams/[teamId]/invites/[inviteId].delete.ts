// DELETE /api/teams/:teamId/invites/:inviteId — owner-only revoke.
// Idempotent: returns the (already-)revoked row instead of 404.

import { uuidSchema } from '../../../../../shared/schemas'
import { getInviteById, revokeInvite } from '../../../../db/invites'
import { requireOwner, requireTeamAccess } from '../../../../utils/auth'
import { createApiError } from '../../../../utils/errors'

export default defineEventHandler(async (event) => {
  const teamId = getRouterParam(event, 'teamId') ?? ''
  const inviteId = getRouterParam(event, 'inviteId') ?? ''
  if (!uuidSchema.safeParse(teamId).success) throw createApiError('NOT_FOUND')
  if (!uuidSchema.safeParse(inviteId).success) throw createApiError('NOT_FOUND')

  const { member } = await requireTeamAccess(event, teamId)
  requireOwner(member)

  const existing = await getInviteById(inviteId)
  if (!existing || existing.teamId !== teamId) throw createApiError('NOT_FOUND')

  const revoked = await revokeInvite(inviteId)
  return { invite: revoked }
})
