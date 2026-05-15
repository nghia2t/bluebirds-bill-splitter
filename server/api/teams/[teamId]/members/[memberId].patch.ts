// PATCH /api/teams/:teamId/members/:memberId — self or owner.
//
// A member can edit their own display name and payment info; an owner can
// edit anyone's. Role and membership-status changes are intentionally not in
// this schema — owner promotion lands in a later phase, and removal has its
// own DELETE endpoint.

import { memberUpdateSchema, uuidSchema } from '../../../../../shared/schemas'
import { getMemberById, updateMember } from '../../../../db/teams'
import { requireTeamAccess } from '../../../../utils/auth'
import { createApiError } from '../../../../utils/errors'

export default defineEventHandler(async (event) => {
  const teamId = getRouterParam(event, 'teamId') ?? ''
  const memberId = getRouterParam(event, 'memberId') ?? ''
  if (!uuidSchema.safeParse(teamId).success) throw createApiError('NOT_FOUND')
  if (!uuidSchema.safeParse(memberId).success) throw createApiError('NOT_FOUND')

  const { user, member: caller } = await requireTeamAccess(event, teamId)

  const target = await getMemberById(memberId)
  if (!target || target.teamId !== teamId || target.removedAt !== null) {
    throw createApiError('NOT_FOUND')
  }

  const isSelf = target.userId === user.id
  const isOwner = caller.role === 'owner'
  if (!isSelf && !isOwner) throw createApiError('FORBIDDEN')

  const parsed = await readValidatedBody(event, (b) => memberUpdateSchema.safeParse(b))
  if (!parsed.success) {
    throw createApiError('VALIDATION', 'Invalid member patch', parsed.error.flatten())
  }

  const updated = await updateMember(memberId, parsed.data)
  if (!updated) throw createApiError('NOT_FOUND')
  return { member: updated }
})
