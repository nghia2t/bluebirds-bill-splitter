// PATCH /api/teams/:teamId/members/:memberId/role — owner-only.
//
// Used for ownership transfer (promote a member to owner) and demotion. The
// last active owner can't be demoted; transfer ownership first.

import { memberRolePatchSchema, uuidSchema } from '../../../../../../shared/schemas'
import {
  countActiveOwners,
  getMemberById,
  setMemberRole,
} from '../../../../../db/teams'
import { requireOwner, requireTeamAccess } from '../../../../../utils/auth'
import { createApiError } from '../../../../../utils/errors'

export default defineEventHandler(async (event) => {
  const teamId = getRouterParam(event, 'teamId') ?? ''
  const memberId = getRouterParam(event, 'memberId') ?? ''
  if (!uuidSchema.safeParse(teamId).success) throw createApiError('NOT_FOUND')
  if (!uuidSchema.safeParse(memberId).success) throw createApiError('NOT_FOUND')

  const { member: caller } = await requireTeamAccess(event, teamId)
  requireOwner(caller)

  const target = await getMemberById(memberId)
  if (!target || target.teamId !== teamId || target.removedAt !== null) {
    throw createApiError('NOT_FOUND')
  }

  const parsed = await readValidatedBody(event, (b) => memberRolePatchSchema.safeParse(b))
  if (!parsed.success) {
    throw createApiError('VALIDATION', 'Invalid role payload', parsed.error.flatten())
  }

  if (target.role === 'owner' && parsed.data.role === 'member') {
    if ((await countActiveOwners(teamId)) <= 1) {
      throw createApiError('FORBIDDEN', 'Cannot demote the last owner')
    }
  }

  if (target.role === parsed.data.role) return { member: target }

  const updated = await setMemberRole(memberId, parsed.data.role)
  return { member: updated }
})
