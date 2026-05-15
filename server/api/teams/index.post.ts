// POST /api/teams — create a new team.  The caller becomes the owner-member
// of the team in the same DB transaction (see createTeamWithOwner).

import { teamCreateSchema } from '../../../shared/schemas'
import { createTeamWithOwner } from '../../db/teams'
import { requireUser } from '../../utils/auth'
import { createApiError } from '../../utils/errors'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)

  const parsed = await readValidatedBody(event, (body) => teamCreateSchema.safeParse(body))
  if (!parsed.success) {
    throw createApiError('VALIDATION', 'Invalid team payload', parsed.error.flatten())
  }

  const { team, ownerMember } = await createTeamWithOwner({
    name: parsed.data.name,
    defaultCurrency: parsed.data.defaultCurrency,
    timezone: parsed.data.timezone,
    createdBy: user.id,
    ownerDisplayName: user.name,
  })

  return { team, member: ownerMember }
})
