// POST /api/invites/:token/accept — the only quasi-public endpoint.  Sign-in
// is still required (the token is the team-authorisation, the session is the
// identity).  Adds the caller as an active member and returns the team they
// just joined.
//
// TODO(rate-limit): per the spec, this endpoint should be rate-limited to
// ~10/min/IP to discourage token-guessing.  Add a sliding-window counter
// (Upstash Redis or @nuxt/rate-limiter) once we move past local dev.

import { useDb } from '../../../db/client'
import { findInviteByToken, isInviteValid } from '../../../db/invites'
import { findActiveMembership } from '../../../db/teams'
import { teamMembers } from '../../../db/schema'
import { requireUser } from '../../../utils/auth'
import { createApiError } from '../../../utils/errors'
import { isWellFormedToken } from '../../../utils/invite-tokens'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)

  const token = getRouterParam(event, 'token') ?? ''
  if (!isWellFormedToken(token)) throw createApiError('INVALID_INVITE')

  const invite = await findInviteByToken(token)
  if (!invite || !isInviteValid(invite)) throw createApiError('INVALID_INVITE')

  const existing = await findActiveMembership(invite.teamId, user.id)
  if (existing) throw createApiError('ALREADY_MEMBER')

  // Insert the membership; no transaction needed because there is exactly one
  // write and the partial unique index prevents accidental double-insert if
  // two requests race.
  const db = useDb()
  const [member] = await db
    .insert(teamMembers)
    .values({
      teamId: invite.teamId,
      userId: user.id,
      displayName: user.name,
      role: 'member',
    })
    .returning()

  return { teamId: invite.teamId, member }
})
