// Bill queries.  Equal-split shares are computed and persisted at write time
// so the share total exactly reconciles with the bill total even when the
// split has a remainder (the first N shares get +1).
//
// Edits replace participants atomically inside a transaction; partial states
// would either leave dangling participants or temporarily break the share
// total invariant.

import { desc, eq, inArray } from 'drizzle-orm'
import { useDb } from './client'
import { equalSplit } from '../services/money'
import {
  billParticipants,
  bills,
  teams,
  type Bill,
  type BillParticipant,
} from './schema'
import { createApiError } from '../utils/errors'

export interface ParticipantShareArg {
  memberId: string
  shareAmount: bigint
}

export interface CreateBillArgs {
  teamId: string
  occurredOn: string
  description: string
  note?: string | null
  totalAmount: bigint
  paidByMemberId: string
  /** Equal-split path: shares computed via `equalSplit(total, n)`. */
  participantMemberIds?: string[]
  /** Exact-split path: shares persisted as supplied; sum must equal total. */
  participantShares?: ParticipantShareArg[]
  createdBy: string                  // users.id
}

export async function createBill(args: CreateBillArgs): Promise<{
  bill: Bill
  participants: BillParticipant[]
}> {
  const db = useDb()
  return db.transaction(async (tx) => {
    const team = await tx.query.teams.findFirst({
      where: eq(teams.id, args.teamId),
      columns: { id: true, defaultCurrency: true },
    })
    if (!team) throw createApiError('NOT_FOUND')

    const memberIds = await activeMemberIdSet(args.teamId, tx)
    if (!memberIds.has(args.paidByMemberId)) {
      throw createApiError('VALIDATION', 'Payer is not an active member of this team')
    }

    const partRowsBase = resolveShareRows(
      args.totalAmount,
      args.participantMemberIds,
      args.participantShares,
      memberIds,
    )

    const [bill] = await tx.insert(bills).values({
      teamId: args.teamId,
      occurredOn: args.occurredOn,
      description: args.description,
      note: args.note ?? null,
      totalAmount: args.totalAmount,
      currency: team.defaultCurrency,
      paidByMemberId: args.paidByMemberId,
      createdBy: args.createdBy,
    }).returning()

    const partRows = partRowsBase.map((r) => ({ ...r, billId: bill!.id }))
    const inserted = await tx.insert(billParticipants).values(partRows).returning()

    return { bill: bill!, participants: inserted }
  })
}

export interface UpdateBillArgs {
  billId: string
  patch: {
    occurredOn?: string
    description?: string
    note?: string | null
    totalAmount?: bigint
    paidByMemberId?: string
    participantMemberIds?: string[]
    participantShares?: ParticipantShareArg[]
  }
}

export async function updateBill(args: UpdateBillArgs): Promise<{
  bill: Bill
  participants: BillParticipant[]
}> {
  const db = useDb()
  return db.transaction(async (tx) => {
    const existing = await tx.query.bills.findFirst({ where: eq(bills.id, args.billId) })
    if (!existing) throw createApiError('NOT_FOUND')

    const memberIds = await activeMemberIdSet(existing.teamId, tx)

    const finalTotal = args.patch.totalAmount ?? existing.totalAmount
    const finalPayer = args.patch.paidByMemberId ?? existing.paidByMemberId
    if (!memberIds.has(finalPayer)) {
      throw createApiError('VALIDATION', 'Payer is not an active member of this team')
    }

    const [updated] = await tx.update(bills).set({
      occurredOn: args.patch.occurredOn ?? existing.occurredOn,
      description: args.patch.description ?? existing.description,
      // null is meaningful (clears the note); leave existing only when undefined.
      note: args.patch.note === undefined ? existing.note : args.patch.note,
      totalAmount: finalTotal,
      paidByMemberId: finalPayer,
      updatedAt: new Date(),
    }).where(eq(bills.id, args.billId)).returning()

    // Rewrite participants if either total or list changed.  Always recompute
    // when total changes even with the same participants — shares may shift.
    const totalChanged = args.patch.totalAmount !== undefined
    const newIds = args.patch.participantMemberIds
    const newShares = args.patch.participantShares
    const listChanged = newIds !== undefined || newShares !== undefined
    let parts: BillParticipant[]
    if (totalChanged || listChanged) {
      let partRowsBase: { teamMemberId: string; shareAmount: bigint }[]
      if (newShares) {
        partRowsBase = resolveShareRows(finalTotal, undefined, newShares, memberIds)
      } else if (newIds) {
        partRowsBase = resolveShareRows(finalTotal, newIds, undefined, memberIds)
      } else {
        const ids = await currentParticipantIds(tx, args.billId)
        partRowsBase = resolveShareRows(finalTotal, ids, undefined, memberIds)
      }
      await tx.delete(billParticipants).where(eq(billParticipants.billId, args.billId))
      parts = await tx.insert(billParticipants).values(
        partRowsBase.map((r) => ({ ...r, billId: args.billId })),
      ).returning()
    } else {
      parts = await tx.query.billParticipants.findMany({
        where: eq(billParticipants.billId, args.billId),
      })
    }

    return { bill: updated!, participants: parts }
  })
}

export async function deleteBill(billId: string): Promise<void> {
  const db = useDb()
  await db.transaction(async (tx) => {
    const existing = await tx.query.bills.findFirst({ where: eq(bills.id, billId) })
    if (!existing) throw createApiError('NOT_FOUND')
    // Participants cascade via the FK ON DELETE CASCADE.
    await tx.delete(bills).where(eq(bills.id, billId))
  })
}

export async function getBillById(billId: string): Promise<{
  bill: Bill
  participants: BillParticipant[]
} | null> {
  const db = useDb()
  const bill = await db.query.bills.findFirst({ where: eq(bills.id, billId) })
  if (!bill) return null
  const parts = await db.query.billParticipants.findMany({
    where: eq(billParticipants.billId, billId),
  })
  return { bill, participants: parts }
}

/** For authz on flat /api/bills/:billId routes. */
export async function getTeamIdForBill(billId: string): Promise<string | undefined> {
  const db = useDb()
  const row = await db.query.bills.findFirst({
    where: eq(bills.id, billId),
    columns: { teamId: true },
  })
  return row?.teamId
}

/**
 * Load every bill for a team with participants attached, newest-occurred first.
 * Two queries — one for bills, one for participants — assembled in JS.
 */
export async function listBillsForTeam(teamId: string): Promise<
  Array<Bill & { participants: BillParticipant[] }>
> {
  const db = useDb()
  const billRows = await db.query.bills.findMany({
    where: eq(bills.teamId, teamId),
    orderBy: [desc(bills.occurredOn), desc(bills.createdAt)],
  })
  if (billRows.length === 0) return []

  const billIds = billRows.map((b) => b.id)
  const parts = await db.query.billParticipants.findMany({
    where: inArray(billParticipants.billId, billIds),
  })

  const byBill = new Map<string, BillParticipant[]>()
  for (const p of parts) {
    const arr = byBill.get(p.billId) ?? []
    arr.push(p)
    byBill.set(p.billId, arr)
  }
  return billRows.map((b) => ({ ...b, participants: byBill.get(b.id) ?? [] }))
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

async function currentParticipantIds(
  tx: Parameters<Parameters<ReturnType<typeof useDb>['transaction']>[0]>[0],
  billId: string,
): Promise<string[]> {
  const rows = await tx.query.billParticipants.findMany({
    where: eq(billParticipants.billId, billId),
    columns: { teamMemberId: true },
  })
  return rows.map((r) => r.teamMemberId).sort()
}

/**
 * Resolve the participant rows to write for a bill, picking between the
 * equal-split path (`memberIds` → `equalSplit`) and the exact-split path
 * (`shares` → persisted as-is after sum/positivity validation).
 *
 * Exactly one of `memberIds` / `shares` must be supplied; both paths validate
 * that every member is active and unique.
 */
function resolveShareRows(
  total: bigint,
  memberIds: string[] | undefined,
  shares: ParticipantShareArg[] | undefined,
  activeMemberIds: Set<string>,
): { teamMemberId: string; shareAmount: bigint }[] {
  if (shares && memberIds) {
    throw createApiError('VALIDATION', 'Pass exactly one of participantMemberIds or participantShares')
  }
  if (shares) {
    if (shares.length === 0) {
      throw createApiError('VALIDATION', 'At least one participant share is required')
    }
    const seen = new Set<string>()
    let sum = 0n
    for (const s of shares) {
      if (seen.has(s.memberId)) {
        throw createApiError('VALIDATION', `Duplicate share for member ${s.memberId}`)
      }
      seen.add(s.memberId)
      if (!activeMemberIds.has(s.memberId)) {
        throw createApiError('VALIDATION', `Participant ${s.memberId} is not an active member`)
      }
      if (s.shareAmount <= 0n) {
        throw createApiError('VALIDATION', `Share for ${s.memberId} must be > 0`)
      }
      sum += s.shareAmount
    }
    if (sum !== total) {
      throw createApiError('VALIDATION', `Shares sum ${sum} does not equal total ${total}`)
    }
    return shares
      .slice()
      .sort((a, b) => (a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0))
      .map((s) => ({ teamMemberId: s.memberId, shareAmount: s.shareAmount }))
  }

  if (!memberIds) {
    throw createApiError('VALIDATION', 'Participants are required')
  }
  const deduped = Array.from(new Set(memberIds)).sort()
  if (deduped.length === 0) {
    throw createApiError('VALIDATION', 'At least one participant is required')
  }
  for (const id of deduped) {
    if (!activeMemberIds.has(id)) {
      throw createApiError('VALIDATION', `Participant ${id} is not an active member`)
    }
  }
  const computed = equalSplit(total, deduped.length)
  return deduped.map((memberId, i) => ({ teamMemberId: memberId, shareAmount: computed[i]! }))
}
