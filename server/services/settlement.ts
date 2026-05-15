// Pure settlement engine.  No DB, no Nuxt context.  Takes plain inputs and
// produces (a) per-member balances and (b) a minimised list of suggested
// transfers that would zero everyone out.  Bills add debt; recorded
// settlements pay it down.
//
// Used both by the live ledger view (to suggest who should pay whom right
// now) and by anything that wants to validate consistency.

export interface SettlementMember {
  id: string
  displayName: string
}

export interface SettlementBillParticipant {
  memberId: string
  shareAmount: bigint
}

export interface SettlementBill {
  totalAmount: bigint
  paidByMemberId: string
  participants: SettlementBillParticipant[]
}

/** A recorded payment that's already happened — fact, not suggestion. */
export interface SettlementRecord {
  fromMemberId: string
  toMemberId: string
  amount: bigint
}

export interface SettlementInput {
  members: SettlementMember[]
  bills: SettlementBill[]
  /** Already-recorded settlements that reduce who-owes-whom going forward. */
  settlements?: SettlementRecord[]
}

export interface MemberBalance {
  memberId: string
  displayName: string
  /** Positive: the team owes this member. Negative: this member owes the team. */
  balance: bigint
}

export interface Transfer {
  fromMemberId: string
  toMemberId: string
  amount: bigint
}

export interface SettlementResult {
  balances: MemberBalance[]
  transfers: Transfer[]
}

export class SettlementInvariantError extends Error {
  readonly code = 'SETTLEMENT_INVARIANT'
  constructor(message: string) { super(message) }
}

/**
 * Compute balances and minimised suggested transfers.
 *
 * @throws SettlementInvariantError if the input is internally inconsistent
 *   (sum of shares ≠ bill total, sum of balances ≠ 0, etc.).  Callers can
 *   either surface this as a 500 or fall back to balances-only.
 */
export function computeSettlement(input: SettlementInput): SettlementResult {
  validateInput(input)

  const balanceByMember = new Map<string, bigint>()
  for (const m of input.members) balanceByMember.set(m.id, 0n)

  for (const bill of input.bills) {
    addTo(balanceByMember, bill.paidByMemberId, bill.totalAmount)

    let sumShares = 0n
    for (const p of bill.participants) {
      addTo(balanceByMember, p.memberId, -p.shareAmount)
      sumShares += p.shareAmount
    }

    if (sumShares !== bill.totalAmount) {
      throw new SettlementInvariantError(
        `Bill share sum (${sumShares}) does not equal total (${bill.totalAmount}). ` +
        `Bill paid by ${bill.paidByMemberId}.`,
      )
    }
  }

  // Apply recorded settlements: when A pays B, A is no longer in debt by that
  // amount and B is no longer owed by that amount.  (A.balance += amount,
  // B.balance -= amount.)
  for (const s of input.settlements ?? []) {
    addTo(balanceByMember, s.fromMemberId, s.amount)
    addTo(balanceByMember, s.toMemberId, -s.amount)
  }

  const balances: MemberBalance[] = input.members.map((m) => ({
    memberId: m.id,
    displayName: m.displayName,
    balance: balanceByMember.get(m.id) ?? 0n,
  }))

  const sumBalances = balances.reduce((acc, b) => acc + b.balance, 0n)
  if (sumBalances !== 0n) {
    throw new SettlementInvariantError(`Balances do not sum to zero: ${sumBalances}`)
  }

  const transfers = minimiseTransfers(balances)
  verifyTransfers(balances, transfers)
  return { balances, transfers }
}

function addTo(map: Map<string, bigint>, key: string, delta: bigint): void {
  if (!map.has(key)) {
    throw new SettlementInvariantError(`Unknown member id: ${key}`)
  }
  map.set(key, map.get(key)! + delta)
}

function validateInput(input: SettlementInput): void {
  const memberIds = new Set(input.members.map((m) => m.id))
  if (memberIds.size !== input.members.length) {
    throw new SettlementInvariantError('Duplicate member ids')
  }
  for (const bill of input.bills) {
    if (bill.totalAmount <= 0n) {
      throw new SettlementInvariantError(`Bill total must be > 0, got ${bill.totalAmount}`)
    }
    if (!memberIds.has(bill.paidByMemberId)) {
      throw new SettlementInvariantError(`Bill payer ${bill.paidByMemberId} is not a member`)
    }
    if (bill.participants.length === 0) {
      throw new SettlementInvariantError('Bill has no participants')
    }
    const seen = new Set<string>()
    for (const p of bill.participants) {
      if (seen.has(p.memberId)) {
        throw new SettlementInvariantError(`Duplicate participant ${p.memberId}`)
      }
      seen.add(p.memberId)
      if (!memberIds.has(p.memberId)) {
        throw new SettlementInvariantError(`Participant ${p.memberId} is not a member`)
      }
      if (p.shareAmount < 0n) {
        throw new SettlementInvariantError(`Negative share ${p.shareAmount}`)
      }
    }
  }
  for (const s of input.settlements ?? []) {
    if (s.amount <= 0n) {
      throw new SettlementInvariantError(`Settlement amount must be > 0, got ${s.amount}`)
    }
    if (!memberIds.has(s.fromMemberId)) {
      throw new SettlementInvariantError(`Settlement from ${s.fromMemberId} is not a member`)
    }
    if (!memberIds.has(s.toMemberId)) {
      throw new SettlementInvariantError(`Settlement to ${s.toMemberId} is not a member`)
    }
  }
}

/**
 * Greedy two-pointer algorithm: largest creditor receives from largest
 * debtor until balances zero out.  Produces ≤ N−1 transfers.  Optimal in
 * everyday cases (the general minimum-cash-flow problem is NP-hard).
 */
function minimiseTransfers(balances: MemberBalance[]): Transfer[] {
  // Sort by member id to make ties deterministic.
  const creditors = balances
    .filter((b) => b.balance > 0n)
    .map((b) => ({ id: b.memberId, remaining: b.balance }))
    .sort((a, b) => (a.remaining < b.remaining ? 1 : a.remaining > b.remaining ? -1 : a.id.localeCompare(b.id)))

  const debtors = balances
    .filter((b) => b.balance < 0n)
    .map((b) => ({ id: b.memberId, remaining: -b.balance }))
    .sort((a, b) => (a.remaining < b.remaining ? 1 : a.remaining > b.remaining ? -1 : a.id.localeCompare(b.id)))

  const transfers: Transfer[] = []
  let ci = 0
  let di = 0
  while (ci < creditors.length && di < debtors.length) {
    const cred = creditors[ci]!
    const debt = debtors[di]!
    const amount = cred.remaining < debt.remaining ? cred.remaining : debt.remaining
    if (amount <= 0n) {
      throw new SettlementInvariantError(`Non-positive transfer amount ${amount}`)
    }
    transfers.push({ fromMemberId: debt.id, toMemberId: cred.id, amount })
    cred.remaining -= amount
    debt.remaining -= amount
    if (cred.remaining === 0n) ci++
    if (debt.remaining === 0n) di++
  }
  return transfers
}

function verifyTransfers(balances: MemberBalance[], transfers: Transfer[]): void {
  const net = new Map<string, bigint>()
  for (const b of balances) net.set(b.memberId, 0n)
  for (const t of transfers) {
    if (t.amount <= 0n) {
      throw new SettlementInvariantError(`Non-positive transfer ${t.amount}`)
    }
    if (t.fromMemberId === t.toMemberId) {
      throw new SettlementInvariantError(`Self-transfer for ${t.fromMemberId}`)
    }
    net.set(t.fromMemberId, (net.get(t.fromMemberId) ?? 0n) - t.amount)
    net.set(t.toMemberId, (net.get(t.toMemberId) ?? 0n) + t.amount)
  }
  for (const b of balances) {
    const observed = net.get(b.memberId) ?? 0n
    if (observed !== b.balance) {
      throw new SettlementInvariantError(
        `Member ${b.memberId} net transfer ${observed} ≠ balance ${b.balance}`,
      )
    }
  }
}
