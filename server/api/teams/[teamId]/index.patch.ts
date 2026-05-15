// PATCH /api/teams/:teamId — owner-only updates.

import { teamUpdateSchema, uuidSchema } from '../../../../shared/schemas'
import { updateTeam } from '../../../db/teams'
import { requireOwner, requireTeamAccess } from '../../../utils/auth'
import { createApiError } from '../../../utils/errors'

export default defineEventHandler(async (event) => {
  const teamId = getRouterParam(event, 'teamId') ?? ''
  if (!uuidSchema.safeParse(teamId).success) throw createApiError('NOT_FOUND')

  const { member } = await requireTeamAccess(event, teamId)
  requireOwner(member)

  const parsed = await readValidatedBody(event, (b) => teamUpdateSchema.safeParse(b))
  if (!parsed.success) {
    throw createApiError('VALIDATION', 'Invalid team patch', parsed.error.flatten())
  }

  const team = await updateTeam(teamId, parsed.data)
  if (!team) throw createApiError('NOT_FOUND')
  return { team }
})
