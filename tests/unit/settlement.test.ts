import { describe, expect, it } from 'vitest'
import {
  SettlementInvariantError,
  computeSettlement,
  type SettlementInput,
} from '../../server/services/settlement'

const members = (...ids: string[]) => ids.map((id) => ({ id, displayName: id }))

describe('computeSettlement — balances', () => {
  it('one bill, equal split, payer included', () => {
    const input: SettlementInput = {
      members: members('A', 'B', 'C'),
      bills: [{
        totalAmount: 900n,
        paidByMemberId: 'A',
        participants: [
          { memberId: 'A', shareAmount: 300n },
          { memberId: 'B', shareAmount: 300n },
          { memberId: 'C', shareAmount: 300n },
        ],
      }],
    }
    const { balances } = computeSettlement(input)
    expect(balances.find((b) => b.memberId === 'A')!.balance).toBe(600n)
    expect(balances.find((b) => b.memberId === 'B')!.balance).toBe(-300n)
    expect(balances.find((b) => b.memberId === 'C')!.balance).toBe(-300n)
  })

  it('sponsor mode — payer left out of participants', () => {
    const input: SettlementInput = {
      members: members('A', 'B', 'C'),
      bills: [{
        totalAmount: 600n,
        paidByMemberId: 'A',
        participants: [
          { memberId: 'B', shareAmount: 300n },
          { memberId: 'C', shareAmount: 300n },
        ],
      }],
    }
    const { balances } = computeSettlement(input)
    expect(balances.find((b) => b.memberId === 'A')!.balance).toBe(600n)
    expect(balances.find((b) => b.memberId === 'B')!.balance).toBe(-300n)
    expect(balances.find((b) => b.memberId === 'C')!.balance).toBe(-300n)
  })

  it('sums to zero across many bills', () => {
    const input: SettlementInput = {
      members: members('A', 'B', 'C'),
      bills: [
        {
          totalAmount: 700n,
          paidByMemberId: 'A',
          participants: [
            { memberId: 'A', shareAmount: 234n },
            { memberId: 'B', shareAmount: 233n },
            { memberId: 'C', shareAmount: 233n },
          ],
        },
        {
          totalAmount: 500n,
          paidByMemberId: 'B',
          participants: [
            { memberId: 'A', shareAmount: 250n },
            { memberId: 'B', shareAmount: 250n },
          ],
        },
      ],
    }
    const { balances } = computeSettlement(input)
    const sum = balances.reduce((acc, b) => acc + b.balance, 0n)
    expect(sum).toBe(0n)
  })
})

describe('computeSettlement — transfers', () => {
  it('two-person simple case → one transfer', () => {
    const input: SettlementInput = {
      members: members('A', 'B'),
      bills: [{
        totalAmount: 100n,
        paidByMemberId: 'A',
        participants: [
          { memberId: 'A', shareAmount: 50n },
          { memberId: 'B', shareAmount: 50n },
        ],
      }],
    }
    const { transfers } = computeSettlement(input)
    expect(transfers).toEqual([
      { fromMemberId: 'B', toMemberId: 'A', amount: 50n },
    ])
  })

  it('three-person — at most N-1 transfers', () => {
    const input: SettlementInput = {
      members: members('A', 'B', 'C'),
      bills: [
        {
          totalAmount: 300n,
          paidByMemberId: 'A',
          participants: [
            { memberId: 'A', shareAmount: 100n },
            { memberId: 'B', shareAmount: 100n },
            { memberId: 'C', shareAmount: 100n },
          ],
        },
      ],
    }
    const { transfers } = computeSettlement(input)
    expect(transfers.length).toBeLessThanOrEqual(2)
    // Every transfer is positive, no self-transfers.
    for (const t of transfers) {
      expect(t.amount > 0n).toBe(true)
      expect(t.fromMemberId).not.toBe(t.toMemberId)
    }
  })

  it('greedy heuristic resolves classic three-debtor chain in two transfers', () => {
    // A paid 600 split three ways → A=+400, B=-200, C=-200. Then C paid 300 split three ways
    // → C=+200, A=-100, B=-100. Net: A=+300, B=-300, C=0 ⇒ one transfer.
    const input: SettlementInput = {
      members: members('A', 'B', 'C'),
      bills: [
        {
          totalAmount: 600n,
          paidByMemberId: 'A',
          participants: [
            { memberId: 'A', shareAmount: 200n },
            { memberId: 'B', shareAmount: 200n },
            { memberId: 'C', shareAmount: 200n },
          ],
        },
        {
          totalAmount: 300n,
          paidByMemberId: 'C',
          participants: [
            { memberId: 'A', shareAmount: 100n },
            { memberId: 'B', shareAmount: 100n },
            { memberId: 'C', shareAmount: 100n },
          ],
        },
      ],
    }
    const { transfers } = computeSettlement(input)
    expect(transfers).toEqual([
      { fromMemberId: 'B', toMemberId: 'A', amount: 300n },
    ])
  })

  it('transfers net out to balances exactly', () => {
    const input: SettlementInput = {
      members: members('A', 'B', 'C', 'D'),
      bills: [
        {
          totalAmount: 1000n,
          paidByMemberId: 'A',
          participants: [
            { memberId: 'A', shareAmount: 250n },
            { memberId: 'B', shareAmount: 250n },
            { memberId: 'C', shareAmount: 250n },
            { memberId: 'D', shareAmount: 250n },
          ],
        },
        {
          totalAmount: 200n,
          paidByMemberId: 'B',
          participants: [
            { memberId: 'C', shareAmount: 100n },
            { memberId: 'D', shareAmount: 100n },
          ],
        },
      ],
    }
    const { balances, transfers } = computeSettlement(input)
    const net = new Map<string, bigint>()
    for (const b of balances) net.set(b.memberId, 0n)
    for (const t of transfers) {
      net.set(t.fromMemberId, net.get(t.fromMemberId)! - t.amount)
      net.set(t.toMemberId, net.get(t.toMemberId)! + t.amount)
    }
    for (const b of balances) {
      expect(net.get(b.memberId)).toBe(b.balance)
    }
  })
})

describe('computeSettlement — invariants', () => {
  it('throws when bill shares do not sum to total', () => {
    const input: SettlementInput = {
      members: members('A', 'B'),
      bills: [{
        totalAmount: 100n,
        paidByMemberId: 'A',
        participants: [
          { memberId: 'A', shareAmount: 40n },
          { memberId: 'B', shareAmount: 40n },
        ],
      }],
    }
    expect(() => computeSettlement(input)).toThrow(SettlementInvariantError)
  })

  it('throws when participant is not a member', () => {
    const input: SettlementInput = {
      members: members('A', 'B'),
      bills: [{
        totalAmount: 100n,
        paidByMemberId: 'A',
        participants: [
          { memberId: 'A', shareAmount: 50n },
          { memberId: 'Z', shareAmount: 50n },
        ],
      }],
    }
    expect(() => computeSettlement(input)).toThrow(SettlementInvariantError)
  })

  it('throws on duplicate participants', () => {
    const input: SettlementInput = {
      members: members('A', 'B'),
      bills: [{
        totalAmount: 100n,
        paidByMemberId: 'A',
        participants: [
          { memberId: 'B', shareAmount: 50n },
          { memberId: 'B', shareAmount: 50n },
        ],
      }],
    }
    expect(() => computeSettlement(input)).toThrow(SettlementInvariantError)
  })

  it('throws on duplicate members', () => {
    const input: SettlementInput = {
      members: [
        { id: 'A', displayName: 'A1' },
        { id: 'A', displayName: 'A2' },
      ],
      bills: [],
    }
    expect(() => computeSettlement(input)).toThrow(SettlementInvariantError)
  })

  it('empty bills yield empty transfers', () => {
    const input: SettlementInput = { members: members('A', 'B'), bills: [] }
    const { transfers, balances } = computeSettlement(input)
    expect(transfers).toEqual([])
    expect(balances.every((b) => b.balance === 0n)).toBe(true)
  })
})
