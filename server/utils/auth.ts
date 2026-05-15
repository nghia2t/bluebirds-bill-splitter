// The single chokepoint for authorization.  Every team-scoped route in
// `server/api/**` runs `requireTeamAccess(event, teamId)` at the top — there
// are no public read endpoints (the only exception is invite acceptance,
// which establishes membership rather than requiring it).
//
// All of these throw via `createApiError` so the client sees a stable code
// (`UNAUTHORIZED` / `FORBIDDEN`) it can localise.

import { and, eq, isNull } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { useDb } from '../db/client'
import { teamMembers, type TeamMember } from '../db/schema'
import { createApiError } from './errors'

export interface SessionUser {
  id: string
  email: string
  name: string
  avatarUrl: string | null
  preferredLang: 'en' | 'vi'
}

/**
 * Throws UNAUTHORIZED if the request has no signed-in session.
 * Returns the session user (already validated by nuxt-auth-utils' cookie crypto).
 */
export async function requireUser(event: H3Event): Promise<SessionUser> {
  const session = await getUserSession(event)
  const user = session?.user as SessionUser | undefined
  if (!user?.id) throw createApiError('UNAUTHORIZED')
  return user
}

/**
 * Throws UNAUTHORIZED if not signed in, FORBIDDEN if signed in but not an
 * active member of `teamId`. Returns the user and the active member row so
 * the handler can branch on role without a second query.
 */
export async function requireTeamAccess(
  event: H3Event,
  teamId: string,
): Promise<{ user: SessionUser; member: TeamMember }> {
  const user = await requireUser(event)
  const db = useDb()

  const member = await db.query.teamMembers.findFirst({
    where: and(
      eq(teamMembers.teamId, teamId),
      eq(teamMembers.userId, user.id),
      isNull(teamMembers.removedAt),
    ),
  })

  if (!member) throw createApiError('FORBIDDEN')
  return { user, member }
}

/**
 * Convenience guard for owner-only actions. Pass the member returned by
 * `requireTeamAccess`; throws FORBIDDEN if the role is not 'owner'.
 *
 *   const { user, member } = await requireTeamAccess(event, teamId)
 *   requireOwner(member)
 */
export function requireOwner(member: TeamMember): void {
  if (member.role !== 'owner') throw createApiError('FORBIDDEN')
}
