// DELETE /api/teams/:teamId/members/:memberId — owner-only soft-remove.
//
// Refuses to remove the last active owner; ownership transfer is a separate
// flow (later phase).  Also refuses to soft-remove an already-removed member.

import { uuidSchema } from '../../../../../shared/schemas'
import {
  countActiveOwners,
  getMemberById,
  softRemoveMember,
} from '../../../../db/teams'
import { requireOwner, requireTeamAccess } from '../../../../utils/auth'
import { createApiError } from '../../../../utils/errors'

export default defineEventHandler(async (event) => {
  const teamId = getRouterParam(event, 'teamId') ?? ''
  const memberId = getRouterParam(event, 'memberId') ?? ''
  if (!uuidSchema.safeParse(teamId).success) throw createApiError('NOT_FOUND')
  if (!uuidSchema.safeParse(memberId).success) throw createApiError('NOT_FOUND')

  const { member: caller } = await requireTeamAccess(event, teamId)
  requireOwner(caller)

  const target = await getMemberById(memberId)
  if (!target || target.teamId !== teamId) throw createApiError('NOT_FOUND')
  if (target.removedAt !== null) return { member: target }

  if (target.role === 'owner' && (await countActiveOwners(teamId)) <= 1) {
    throw createApiError('FORBIDDEN', 'Cannot remove the last owner')
  }

  const removed = await softRemoveMember(memberId)
  return { member: removed }
})
