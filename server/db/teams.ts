// Team and team-member queries.  All Drizzle access for teams lives here so
// nothing else in `server/` reaches into schema directly.

import { and, asc, desc, eq, isNull } from 'drizzle-orm'
import { useDb } from './client'
import { teamMembers, teams, type Team, type TeamMember } from './schema'

export interface CreateTeamArgs {
  name: string
  defaultCurrency: string
  timezone: string
  createdBy: string             // users.id
  ownerDisplayName: string      // typically users.name
}

export async function createTeamWithOwner(args: CreateTeamArgs): Promise<{
  team: Team
  ownerMember: TeamMember
}> {
  const db = useDb()

  return db.transaction(async (tx) => {
    const [team] = await tx.insert(teams).values({
      name: args.name,
      defaultCurrency: args.defaultCurrency,
      timezone: args.timezone,
      createdBy: args.createdBy,
    }).returning()

    const [ownerMember] = await tx.insert(teamMembers).values({
      teamId: team!.id,
      userId: args.createdBy,
      displayName: args.ownerDisplayName,
      role: 'owner',
    }).returning()

    return { team: team!, ownerMember: ownerMember! }
  })
}

export async function listTeamsForUser(userId: string): Promise<Team[]> {
  const db = useDb()
  const rows = await db
    .select({ team: teams })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(and(eq(teamMembers.userId, userId), isNull(teamMembers.removedAt)))
    .orderBy(desc(teamMembers.joinedAt))
  return rows.map((r) => r.team)
}

export async function getTeamById(teamId: string): Promise<Team | undefined> {
  const db = useDb()
  return db.query.teams.findFirst({ where: eq(teams.id, teamId) })
}

export interface TeamUpdate {
  name?: string
  defaultCurrency?: string
  vndInputMode?: 'literal' | 'thousands'
  timezone?: string
}

export async function updateTeam(teamId: string, patch: TeamUpdate): Promise<Team | undefined> {
  const db = useDb()
  const [updated] = await db
    .update(teams)
    .set(patch)
    .where(eq(teams.id, teamId))
    .returning()
  return updated
}

/**
 * Hard-delete a team. Cascades through cycles, bills, bill_participants,
 * settlements, team_members and team_invites via the FK ON DELETE CASCADE
 * declarations in schema.ts. There is no soft-delete in v1 — once you call
 * this, the team and all its history are gone.
 */
export async function deleteTeam(teamId: string): Promise<void> {
  const db = useDb()
  await db.delete(teams).where(eq(teams.id, teamId))
}

// ---------- members ----------

export async function listActiveMembers(teamId: string): Promise<TeamMember[]> {
  const db = useDb()
  return db.query.teamMembers.findMany({
    where: and(eq(teamMembers.teamId, teamId), isNull(teamMembers.removedAt)),
    orderBy: [asc(teamMembers.joinedAt), asc(teamMembers.id)],
  })
}

export async function getMemberById(memberId: string): Promise<TeamMember | undefined> {
  const db = useDb()
  return db.query.teamMembers.findFirst({ where: eq(teamMembers.id, memberId) })
}

export interface MemberUpdate {
  displayName?: string
  paymentInfo?: string | null
}

export async function updateMember(
  memberId: string,
  patch: MemberUpdate,
): Promise<TeamMember | undefined> {
  const db = useDb()
  const [updated] = await db
    .update(teamMembers)
    .set(patch)
    .where(eq(teamMembers.id, memberId))
    .returning()
  return updated
}

export async function setMemberRole(
  memberId: string,
  role: 'owner' | 'member',
): Promise<TeamMember | undefined> {
  const db = useDb()
  const [updated] = await db
    .update(teamMembers)
    .set({ role })
    .where(eq(teamMembers.id, memberId))
    .returning()
  return updated
}

export async function softRemoveMember(memberId: string): Promise<TeamMember | undefined> {
  const db = useDb()
  const [updated] = await db
    .update(teamMembers)
    .set({ removedAt: new Date() })
    .where(eq(teamMembers.id, memberId))
    .returning()
  return updated
}

export async function findActiveMembership(
  teamId: string,
  userId: string,
): Promise<TeamMember | undefined> {
  const db = useDb()
  return db.query.teamMembers.findFirst({
    where: and(
      eq(teamMembers.teamId, teamId),
      eq(teamMembers.userId, userId),
      isNull(teamMembers.removedAt),
    ),
  })
}

export async function countActiveOwners(teamId: string): Promise<number> {
  const db = useDb()
  const rows = await db.query.teamMembers.findMany({
    where: and(
      eq(teamMembers.teamId, teamId),
      eq(teamMembers.role, 'owner'),
      isNull(teamMembers.removedAt),
    ),
    columns: { id: true },
  })
  return rows.length
}
