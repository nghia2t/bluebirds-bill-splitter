// Settlement queries.  In the running-ledger model a settlement is just a
// recorded payment between two team members ("A paid B 50k on the 12th") —
// it's a fact, not a state machine.  Creating one reduces the from-member's
// debt in the live balance computation; deleting one undoes it.

import { desc, eq } from 'drizzle-orm'
import { useDb } from './client'
import { settlements, teams, type Settlement } from './schema'
import { createApiError } from '../utils/errors'

export interface CreateSettlementArgs {
  teamId: string
  fromMemberId: string
  toMemberId: string
  amount: bigint
  settledOn: string                   // YYYY-MM-DD
  note?: string | null
  createdBy: string                   // users.id
}

export async function createSettlement(args: CreateSettlementArgs): Promise<Settlement> {
  if (args.fromMemberId === args.toMemberId) {
    throw createApiError('VALIDATION', 'from and to must differ')
  }
  if (args.amount <= 0n) {
    throw createApiError('VALIDATION', 'amount must be > 0')
  }

  const db = useDb()
  return db.transaction(async (tx) => {
    const team = await tx.query.teams.findFirst({
      where: eq(teams.id, args.teamId),
      columns: { id: true, defaultCurrency: true },
    })
    if (!team) throw createApiError('NOT_FOUND')

    const memberIds = await activeMemberIdSet(args.teamId, tx)
    if (!memberIds.has(args.fromMemberId)) {
      throw createApiError('VALIDATION', 'from member is not active in this team')
    }
    if (!memberIds.has(args.toMemberId)) {
      throw createApiError('VALIDATION', 'to member is not active in this team')
    }

    const [created] = await tx.insert(settlements).values({
      teamId: args.teamId,
      fromMemberId: args.fromMemberId,
      toMemberId: args.toMemberId,
      amount: args.amount,
      currency: team.defaultCurrency,
      settledOn: args.settledOn,
      note: args.note ?? null,
      createdBy: args.createdBy,
    }).returning()
    return created!
  })
}

export async function listSettlementsForTeam(teamId: string): Promise<Settlement[]> {
  const db = useDb()
  return db.query.settlements.findMany({
    where: eq(settlements.teamId, teamId),
    orderBy: [desc(settlements.settledOn), desc(settlements.createdAt)],
  })
}

export async function getSettlementById(id: string): Promise<Settlement | undefined> {
  const db = useDb()
  return db.query.settlements.findFirst({ where: eq(settlements.id, id) })
}

/** For authz on flat /api/settlements/:id routes. */
export async function getTeamIdForSettlement(id: string): Promise<string | undefined> {
  const db = useDb()
  const row = await db.query.settlements.findFirst({
    where: eq(settlements.id, id),
    columns: { teamId: true },
  })
  return row?.teamId
}

export async function deleteSettlement(id: string): Promise<void> {
  const db = useDb()
  const result = await db.delete(settlements).where(eq(settlements.id, id)).returning()
  if (result.length === 0) throw createApiError('NOT_FOUND')
}

// ---------- helpers ----------

async function activeMemberIdSet(
  teamId: string,
  tx: Parameters<Parameters<ReturnType<typeof useDb>['transaction']>[0]>[0],
): Promise<Set<string>> {
  const rows = await tx.query.teamMembers.findMany({
    where: (m, { and, eq, isNull }) => and(eq(m.teamId, teamId), isNull(m.removedAt)),
    columns: { id: true },
  })
  return new Set(rows.map((r) => r.id))
}
