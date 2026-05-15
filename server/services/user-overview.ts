// Cross-team aggregation used by the signed-in dashboard, activity feed, and
// settlements page.  Builds one read model so those three pages don't have to
// fan out across `/api/teams/.../ledger` per group.
//
// Currencies are deliberately not summed across teams — instead we report
// per-currency totals.  Most users only use one currency, so the UI can pick
// the dominant entry and show "VND 1.250.000" as the headline; for the
// multi-currency edge case the dashboard renders a small breakdown.

import { desc, eq, inArray, isNull, and } from 'drizzle-orm'
import { useDb } from '../db/client'
import {
  billParticipants,
  bills,
  settlements,
  teamMembers,
  teams,
  type Bill,
  type BillParticipant,
  type Settlement,
  type Team,
  type TeamMember,
} from '../db/schema'
import { buildLedgerView } from './team-ledger'

export interface OverviewTeamSummary {
  team: Team
  /** The active member row for the requesting user. */
  member: TeamMember
  /** Every active member of this team (for avatar / name lookups). */
  members: TeamMember[]
  /** Sum of `bills.totalAmount` (bigint as string). */
  totalSpend: string
  billCount: number
  /** The user's signed balance in this team (positive ⇒ owed to them). */
  yourBalance: string
}

export interface OverviewSuggestedTransfer {
  teamId: string
  teamName: string
  currency: string
  fromMember: { id: string; displayName: string }
  toMember: { id: string; displayName: string }
  amount: string
  /** 'pay' = requesting user pays, 'receive' = requesting user receives. */
  direction: 'pay' | 'receive' | 'other'
  /** Optional payment info string on the receiver. */
  paymentInfo: string | null
}

export interface OverviewActivityItem {
  kind: 'bill' | 'settlement'
  id: string
  teamId: string
  teamName: string
  currency: string
  /** Bills use occurredOn; settlements use settledOn (both YYYY-MM-DD). */
  date: string
  /** createdAt — used for sort tiebreaker. */
  createdAt: Date
  title: string
  /** The display name of the person who created the entry. */
  actor: { memberId: string | null; displayName: string; isYou: boolean }
  /** Counterparty name when relevant ("Paid Sarah" / "Sarah paid you"). */
  counterparty?: { displayName: string; isYou: boolean }
  amount: string
  /**
   * 'positive' = good for the user (they're owed / received); 'negative' = bad
   * (they paid / owe); 'neutral' = neither party is the user.
   */
  direction: 'positive' | 'negative' | 'neutral'
}

export interface OverviewBalanceByCurrency {
  currency: string
  /** Sum of positive per-team balances. */
  owed: string
  /** Sum of (absolute) negative per-team balances. */
  owes: string
  /** owed − owes. */
  net: string
}

export interface UserOverview {
  teams: OverviewTeamSummary[]
  /** Per-currency rollup of how much you're owed vs how much you owe. */
  balances: OverviewBalanceByCurrency[]
  /** The "headline" currency (most active group's currency, by bill count). */
  primaryCurrency: string | null
  /** Suggested transfers across all groups — already ranked you-first. */
  suggested: OverviewSuggestedTransfer[]
  /** Recent bills + settlements, sorted newest-first.  Capped by `limit`. */
  activity: OverviewActivityItem[]
  /** Recorded payments involving the user, newest-first (own queue). */
  history: OverviewActivityItem[]
}

export interface BuildUserOverviewArgs {
  userId: string
  /** Hard cap on the activity feed length.  Defaults to 25. */
  activityLimit?: number
}

export async function buildUserOverview(args: BuildUserOverviewArgs): Promise<UserOverview> {
  const db = useDb()
  const activityLimit = args.activityLimit ?? 25

  // 1. Which teams is the user an active member of?
  const myMemberships = await db
    .select({ team: teams, member: teamMembers })
    .from(teamMembers)
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(and(eq(teamMembers.userId, args.userId), isNull(teamMembers.removedAt)))

  if (myMemberships.length === 0) {
    return {
      teams: [],
      balances: [],
      primaryCurrency: null,
      suggested: [],
      activity: [],
      history: [],
    }
  }

  const teamIds = myMemberships.map((m) => m.team.id)
  const myMemberByTeam = new Map(myMemberships.map((m) => [m.team.id, m.member]))

  // 2. Load every active member (across all those teams), all bills + shares,
  //    and all settlements in batches keyed by teamId.
  const [allMembers, allBills, allParts, allSettlements] = await Promise.all([
    db.query.teamMembers.findMany({
      where: and(inArray(teamMembers.teamId, teamIds), isNull(teamMembers.removedAt)),
    }),
    db.query.bills.findMany({
      where: inArray(bills.teamId, teamIds),
      orderBy: [desc(bills.occurredOn), desc(bills.createdAt)],
    }),
    (async () => {
      const billRows = await db.query.bills.findMany({
        where: inArray(bills.teamId, teamIds),
        columns: { id: true },
      })
      if (billRows.length === 0) return [] as BillParticipant[]
      return db.query.billParticipants.findMany({
        where: inArray(billParticipants.billId, billRows.map((b) => b.id)),
      })
    })(),
    db.query.settlements.findMany({
      where: inArray(settlements.teamId, teamIds),
      orderBy: [desc(settlements.settledOn), desc(settlements.createdAt)],
    }),
  ])

  // Index for lookup ----------------------------------------------------------
  const membersByTeam = new Map<string, TeamMember[]>()
  for (const m of allMembers) {
    const arr = membersByTeam.get(m.teamId) ?? []
    arr.push(m)
    membersByTeam.set(m.teamId, arr)
  }
  const memberById = new Map<string, TeamMember>()
  for (const m of allMembers) memberById.set(m.id, m)

  const billsByTeam = new Map<string, Bill[]>()
  for (const b of allBills) {
    const arr = billsByTeam.get(b.teamId) ?? []
    arr.push(b)
    billsByTeam.set(b.teamId, arr)
  }
  const partsByBill = new Map<string, BillParticipant[]>()
  for (const p of allParts) {
    const arr = partsByBill.get(p.billId) ?? []
    arr.push(p)
    partsByBill.set(p.billId, arr)
  }
  const settlementsByTeam = new Map<string, Settlement[]>()
  for (const s of allSettlements) {
    const arr = settlementsByTeam.get(s.teamId) ?? []
    arr.push(s)
    settlementsByTeam.set(s.teamId, arr)
  }

  // 3. Per-team ledger view + your-balance.
  const teamSummaries: OverviewTeamSummary[] = []
  const suggested: OverviewSuggestedTransfer[] = []
  const otherSuggested: OverviewSuggestedTransfer[] = []
  const balancesByCurrency = new Map<string, { owed: bigint; owes: bigint }>()
  const billCountByCurrency = new Map<string, number>()

  for (const { team } of myMemberships) {
    const myMember = myMemberByTeam.get(team.id)!
    const members = (membersByTeam.get(team.id) ?? []).sort((a, b) =>
      a.joinedAt.getTime() - b.joinedAt.getTime(),
    )
    const teamBills = billsByTeam.get(team.id) ?? []
    const teamSettlements = settlementsByTeam.get(team.id) ?? []

    const view = buildLedgerView({
      members: members.map((m) => ({ id: m.id, displayName: m.displayName })),
      bills: teamBills.map((b) => ({
        id: b.id,
        occurredOn: b.occurredOn,
        description: b.description,
        totalAmount: b.totalAmount,
        paidByMemberId: b.paidByMemberId,
        participants: (partsByBill.get(b.id) ?? []).map((p) => ({
          memberId: p.teamMemberId,
          shareAmount: p.shareAmount,
        })),
      })),
      settlements: teamSettlements.map((s) => ({
        id: s.id,
        fromMemberId: s.fromMemberId,
        toMemberId: s.toMemberId,
        amount: s.amount,
        settledOn: s.settledOn,
      })),
    })

    const yourBalance = view.balances.find((b) => b.memberId === myMember.id)?.balance ?? 0n

    teamSummaries.push({
      team,
      member: myMember,
      members,
      totalSpend: view.totals.spent.toString(),
      billCount: view.totals.billCount,
      yourBalance: yourBalance.toString(),
    })

    // Currency rollup ------------------------------------------------------
    const bucket = balancesByCurrency.get(team.defaultCurrency) ?? { owed: 0n, owes: 0n }
    if (yourBalance > 0n) bucket.owed += yourBalance
    else if (yourBalance < 0n) bucket.owes += -yourBalance
    balancesByCurrency.set(team.defaultCurrency, bucket)

    billCountByCurrency.set(
      team.defaultCurrency,
      (billCountByCurrency.get(team.defaultCurrency) ?? 0) + view.totals.billCount,
    )

    // Suggested transfers (you-first, then everyone else) ------------------
    if (view.plan && view.plan.transfers.length) {
      for (const tr of view.plan.transfers) {
        const fromM = memberById.get(tr.fromMemberId)
        const toM = memberById.get(tr.toMemberId)
        if (!fromM || !toM) continue
        const isPay = fromM.id === myMember.id
        const isReceive = toM.id === myMember.id
        const item: OverviewSuggestedTransfer = {
          teamId: team.id,
          teamName: team.name,
          currency: team.defaultCurrency,
          fromMember: { id: fromM.id, displayName: fromM.displayName },
          toMember: { id: toM.id, displayName: toM.displayName },
          amount: tr.amount.toString(),
          direction: isPay ? 'pay' : isReceive ? 'receive' : 'other',
          paymentInfo: toM.paymentInfo ?? null,
        }
        if (isPay || isReceive) suggested.push(item)
        else otherSuggested.push(item)
      }
    }
  }

  // 4. Recent activity feed (bills + settlements interleaved).
  const activityRaw: OverviewActivityItem[] = []
  for (const b of allBills) {
    const team = myMembershipsTeam(myMemberships, b.teamId)
    if (!team) continue
    const myMember = myMemberByTeam.get(team.id)!
    const payer = memberById.get(b.paidByMemberId)
    const isPayer = payer?.id === myMember.id
    // direction from the user's POV: if you paid, you fronted money (positive
    // because the team will owe you back); if someone else paid AND you're a
    // participant, you owe a share (negative); otherwise neutral.
    const myShare = (partsByBill.get(b.id) ?? []).find((p) => p.teamMemberId === myMember.id)
    let direction: OverviewActivityItem['direction'] = 'neutral'
    if (isPayer) direction = 'positive'
    else if (myShare) direction = 'negative'

    activityRaw.push({
      kind: 'bill',
      id: b.id,
      teamId: team.id,
      teamName: team.name,
      currency: team.defaultCurrency,
      date: b.occurredOn,
      createdAt: b.createdAt,
      title: b.description,
      actor: {
        memberId: payer?.id ?? null,
        displayName: payer?.displayName ?? '—',
        isYou: isPayer,
      },
      amount: b.totalAmount.toString(),
      direction,
    })
  }
  for (const s of allSettlements) {
    const team = myMembershipsTeam(myMemberships, s.teamId)
    if (!team) continue
    const myMember = myMemberByTeam.get(team.id)!
    const fromM = memberById.get(s.fromMemberId)
    const toM = memberById.get(s.toMemberId)
    const isFromYou = fromM?.id === myMember.id
    const isToYou = toM?.id === myMember.id
    let direction: OverviewActivityItem['direction'] = 'neutral'
    if (isToYou) direction = 'positive'
    else if (isFromYou) direction = 'negative'

    activityRaw.push({
      kind: 'settlement',
      id: s.id,
      teamId: team.id,
      teamName: team.name,
      currency: team.defaultCurrency,
      date: s.settledOn,
      createdAt: s.createdAt,
      title: isFromYou
        ? `Paid ${toM?.displayName ?? '—'}`
        : isToYou
          ? `${fromM?.displayName ?? '—'} paid you`
          : `${fromM?.displayName ?? '—'} → ${toM?.displayName ?? '—'}`,
      actor: {
        memberId: fromM?.id ?? null,
        displayName: fromM?.displayName ?? '—',
        isYou: isFromYou,
      },
      counterparty: toM
        ? { displayName: toM.displayName, isYou: isToYou }
        : undefined,
      amount: s.amount.toString(),
      direction,
    })
  }

  activityRaw.sort((a, b) => {
    // Sort by createdAt desc — that's our "newness" signal.
    const diff = b.createdAt.getTime() - a.createdAt.getTime()
    if (diff !== 0) return diff
    return b.date.localeCompare(a.date)
  })

  // 5. Rollup balances + primary currency.
  const balances: OverviewBalanceByCurrency[] = []
  for (const [currency, b] of balancesByCurrency.entries()) {
    balances.push({
      currency,
      owed: b.owed.toString(),
      owes: b.owes.toString(),
      net: (b.owed - b.owes).toString(),
    })
  }
  balances.sort((a, b) => a.currency.localeCompare(b.currency))

  // Primary currency = the one with the most bills (tiebreak by member's most
  // recent team).
  let primaryCurrency: string | null = null
  let bestCount = -1
  for (const [c, n] of billCountByCurrency.entries()) {
    if (n > bestCount) { bestCount = n; primaryCurrency = c }
  }
  if (!primaryCurrency && myMemberships.length) {
    primaryCurrency = myMemberships[0]!.team.defaultCurrency
  }

  // History = the user-involved settlements (kind='settlement' + neutral
  // direction filtered out).
  const history = activityRaw.filter((a) => a.kind === 'settlement' && a.direction !== 'neutral')

  return {
    teams: teamSummaries,
    balances,
    primaryCurrency,
    suggested: [...suggested, ...otherSuggested],
    activity: activityRaw.slice(0, activityLimit),
    history: history.slice(0, activityLimit),
  }
}

// ----- helpers --------------------------------------------------------------

function myMembershipsTeam(
  memberships: Array<{ team: Team }>,
  teamId: string,
): Team | undefined {
  return memberships.find((m) => m.team.id === teamId)?.team
}
