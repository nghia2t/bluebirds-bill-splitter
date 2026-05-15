// DELETE /api/teams/:teamId — owner-only, hard delete with cascade.
//
// There is no soft-delete in v1: per the spec, "Delete team" is a single
// owner action. Cycles, bills, bill_participants, settlements, members and
// invites all cascade away through the FK declarations.

import { uuidSchema } from '../../../../shared/schemas'
import { deleteTeam, getTeamById } from '../../../db/teams'
import { requireOwner, requireTeamAccess } from '../../../utils/auth'
import { createApiError } from '../../../utils/errors'

export default defineEventHandler(async (event) => {
  const teamId = getRouterParam(event, 'teamId') ?? ''
  if (!uuidSchema.safeParse(teamId).success) throw createApiError('NOT_FOUND')

  const { member } = await requireTeamAccess(event, teamId)
  requireOwner(member)

  const team = await getTeamById(teamId)
  if (!team) throw createApiError('NOT_FOUND')

  await deleteTeam(teamId)
  return { ok: true }
})
