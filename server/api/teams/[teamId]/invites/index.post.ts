// POST /api/teams/:teamId/invites — owner-only.  Generates a fresh token and
// returns the full invite row including the absolute URL the owner can copy.

import { inviteCreateSchema, uuidSchema } from '../../../../../shared/schemas'
import { issueInvite } from '../../../../db/invites'
import { requireOwner, requireTeamAccess } from '../../../../utils/auth'
import { createApiError } from '../../../../utils/errors'
import { generateInviteToken } from '../../../../utils/invite-tokens'

export default defineEventHandler(async (event) => {
  const teamId = getRouterParam(event, 'teamId') ?? ''
  if (!uuidSchema.safeParse(teamId).success) throw createApiError('NOT_FOUND')

  const { user, member } = await requireTeamAccess(event, teamId)
  requireOwner(member)

  const parsed = await readValidatedBody(event, (b) => inviteCreateSchema.safeParse(b ?? {}))
  if (!parsed.success) {
    throw createApiError('VALIDATION', 'Invalid invite payload', parsed.error.flatten())
  }

  const expiresAt = parsed.data.expiresInHours
    ? new Date(Date.now() + parsed.data.expiresInHours * 60 * 60 * 1000)
    : null

  const invite = await issueInvite({
    teamId,
    createdBy: user.id,
    token: generateInviteToken(),
    expiresAt,
  })

  const baseUrl = useRuntimeConfig().public.baseUrl
  return {
    invite,
    url: `${baseUrl.replace(/\/$/, '')}/invite/${invite.token}`,
  }
})
