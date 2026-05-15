// Invite-token storage and lookup.  Tokens live in a single table with a
// unique index on `token`; revocation is a column stamp, expiry is enforced
// at read time.

import { and, desc, eq, isNull } from 'drizzle-orm'
import { useDb } from './client'
import { teamInvites, type TeamInvite } from './schema'

export interface IssueInviteArgs {
  teamId: string
  createdBy: string             // users.id (the owner)
  token: string                 // pre-generated; we don't generate here so the
                                // route handler controls entropy and shape.
  expiresAt: Date | null
}

export async function issueInvite(args: IssueInviteArgs): Promise<TeamInvite> {
  const db = useDb()
  const [created] = await db
    .insert(teamInvites)
    .values({
      teamId: args.teamId,
      createdBy: args.createdBy,
      token: args.token,
      expiresAt: args.expiresAt,
    })
    .returning()
  return created!
}

/**
 * Active invites for a team (not revoked, not expired), newest first.  Used
 * to render the owner's invite-management section.
 */
export async function listActiveInvites(teamId: string): Promise<TeamInvite[]> {
  const db = useDb()
  const now = new Date()
  const rows = await db.query.teamInvites.findMany({
    where: and(eq(teamInvites.teamId, teamId), isNull(teamInvites.revokedAt)),
    orderBy: desc(teamInvites.createdAt),
  })
  return rows.filter((r) => r.expiresAt === null || r.expiresAt > now)
}

export async function findInviteByToken(token: string): Promise<TeamInvite | undefined> {
  const db = useDb()
  return db.query.teamInvites.findFirst({ where: eq(teamInvites.token, token) })
}

export async function getInviteById(id: string): Promise<TeamInvite | undefined> {
  const db = useDb()
  return db.query.teamInvites.findFirst({ where: eq(teamInvites.id, id) })
}

/**
 * Revoke an invite by stamping `revoked_at`. Idempotent — already-revoked
 * invites stay revoked with their original timestamp.
 */
export async function revokeInvite(id: string): Promise<TeamInvite | undefined> {
  const db = useDb()
  const [updated] = await db
    .update(teamInvites)
    .set({ revokedAt: new Date() })
    .where(and(eq(teamInvites.id, id), isNull(teamInvites.revokedAt)))
    .returning()
  if (updated) return updated
  // Already revoked or not found — return whatever's there.
  return getInviteById(id)
}

/** Validity check for an invite at the moment we look at it. */
export function isInviteValid(invite: TeamInvite, now = new Date()): boolean {
  if (invite.revokedAt !== null) return false
  if (invite.expiresAt !== null && invite.expiresAt <= now) return false
  return true
}
