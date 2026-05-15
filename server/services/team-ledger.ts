// Pure read-model for the team ledger page.  Takes members + bills + recorded
// settlements and produces the data shape the UI consumes: totals, live
// balances, and a suggested transfer plan to settle up.
//
// Kept tolerant of half-edited inputs (a bill that references a soft-removed
// member, etc.) — we surface a `consistent: false` flag instead of throwing,
// so the live view can show balances even when the suggested plan is unsafe
// to compute.

import {
  computeSettlement,
  SettlementInvariantError,
  type SettlementInput,
  type SettlementResult,
} from './settlement'

export interface LedgerViewMember {
  id: string
  displayName: string
}

export interface LedgerViewBill {
  id: string
  occurredOn: string                         // YYYY-MM-DD
  description: string
  totalAmount: bigint
  paidByMemberId: string
  participants: Array<{ memberId: string; shareAmount: bigint }>
}

export interface LedgerViewSettlement {
  id: string
  fromMemberId: string
  toMemberId: string
  amount: bigint
  settledOn: string                          // YYYY-MM-DD
}

export interface LedgerViewInput {
  members: LedgerViewMember[]                // active (not soft-removed)
  bills: LedgerViewBill[]
  settlements: LedgerViewSettlement[]
}

export interface LedgerViewModel {
  totals: {
    billCount: number
    spent: bigint                            // sum of bill.totalAmount
    settlementCount: number
    settled: bigint                          // sum of settlement.amount
  }
  /** Live per-member running balance after bills and settlements. */
  balances: Array<{
    memberId: string
    displayName: string
    /** Positive: team owes them.  Negative: they owe. */
    balance: bigint
  }>
  /**
   * Suggested transfers to zero everyone out RIGHT NOW.  `null` if the input
   * is inconsistent (a bill references an unknown member, share-sum mismatch,
   * etc.) — the UI should show balances and skip the suggestions.
   */
  plan: SettlementResult | null
}

export function buildLedgerView(input: LedgerViewInput): LedgerViewModel {
  let spent = 0n
  for (const b of input.bills) spent += b.totalAmount

  let settled = 0n
  for (const s of input.settlements) settled += s.amount

  // Hand-rolled balance pass — tolerant of unknown member ids (which would
  // throw in computeSettlement).  The strict pass below produces the plan
  // when everything is consistent.
  const balanceByMember = new Map<string, bigint>()
  for (const m of input.members) balanceByMember.set(m.id, 0n)

  let inconsistent = false
  for (const bill of input.bills) {
    if (!balanceByMember.has(bill.paidByMemberId)) {
      inconsistent = true
    } else {
      balanceByMember.set(
        bill.paidByMemberId,
        balanceByMember.get(bill.paidByMemberId)! + bill.totalAmount,
      )
    }
    for (const p of bill.participants) {
      if (!balanceByMember.has(p.memberId)) {
        inconsistent = true
      } else {
        balanceByMember.set(
          p.memberId,
          balanceByMember.get(p.memberId)! - p.shareAmount,
        )
      }
    }
  }

  for (const s of input.settlements) {
    if (!balanceByMember.has(s.fromMemberId) || !balanceByMember.has(s.toMemberId)) {
      inconsistent = true
      continue
    }
    balanceByMember.set(s.fromMemberId, balanceByMember.get(s.fromMemberId)! + s.amount)
    balanceByMember.set(s.toMemberId,   balanceByMember.get(s.toMemberId)!   - s.amount)
  }

  const balances = input.members.map((m) => ({
    memberId: m.id,
    displayName: m.displayName,
    balance: balanceByMember.get(m.id) ?? 0n,
  }))

  let plan: SettlementResult | null = null
  if (!inconsistent) {
    try {
      const settlementInput: SettlementInput = {
        members: input.members,
        bills: input.bills.map((b) => ({
          totalAmount: b.totalAmount,
          paidByMemberId: b.paidByMemberId,
          participants: b.participants,
        })),
        settlements: input.settlements.map((s) => ({
          fromMemberId: s.fromMemberId,
          toMemberId: s.toMemberId,
          amount: s.amount,
        })),
      }
      plan = computeSettlement(settlementInput)
    } catch (err) {
      // Share sum mismatch on some bill — show balances but no plan.
      if (!(err instanceof SettlementInvariantError)) throw err
      plan = null
    }
  }

  return {
    totals: {
      billCount: input.bills.length,
      spent,
      settlementCount: input.settlements.length,
      settled,
    },
    balances,
    plan,
  }
}
