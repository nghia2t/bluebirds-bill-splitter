import { describe, expect, it } from 'vitest'
import {
  billCreateSchema,
  inviteCreateSchema,
  memberRolePatchSchema,
  memberUpdateSchema,
  settlementCreateSchema,
  teamCreateSchema,
  teamUpdateSchema,
} from '../../shared/schemas'

// Real v4 UUIDs — Zod 4's UUID regex enforces the v4 version nibble.
const uuid = '4a7b3f54-8c2d-4f6e-9b1c-2e9a47fd8f3b'
const uuid2 = '7d6c5b4a-3e2f-4a1b-8c9d-0e1f2a3b4c5d'

describe('teamCreateSchema', () => {
  it('accepts a minimal payload and applies defaults', () => {
    const p = teamCreateSchema.parse({ name: 'Bluebirds' })
    expect(p.defaultCurrency).toBe('VND')
    expect(p.timezone).toBe('Asia/Ho_Chi_Minh')
  })

  it('trims and rejects empty names', () => {
    expect(teamCreateSchema.parse({ name: '  Acme  ' }).name).toBe('Acme')
    expect(teamCreateSchema.safeParse({ name: '   ' }).success).toBe(false)
  })

  it('rejects unknown currencies', () => {
    expect(teamCreateSchema.safeParse({ name: 'X', defaultCurrency: 'XYZ' }).success).toBe(false)
  })
})

describe('teamUpdateSchema', () => {
  it('rejects an empty patch', () => {
    expect(teamUpdateSchema.safeParse({}).success).toBe(false)
  })
  it('accepts any single field', () => {
    expect(teamUpdateSchema.parse({ name: 'New' }).name).toBe('New')
  })
})

describe('memberUpdateSchema', () => {
  it('allows clearing payment_info to null', () => {
    expect(memberUpdateSchema.parse({ paymentInfo: null }).paymentInfo).toBe(null)
  })
  it('rejects empty payload', () => {
    expect(memberUpdateSchema.safeParse({}).success).toBe(false)
  })
})

describe('memberRolePatchSchema', () => {
  it('accepts owner / member', () => {
    expect(memberRolePatchSchema.parse({ role: 'owner' }).role).toBe('owner')
    expect(memberRolePatchSchema.parse({ role: 'member' }).role).toBe('member')
  })
  it('rejects garbage', () => {
    expect(memberRolePatchSchema.safeParse({ role: 'admin' }).success).toBe(false)
  })
})

describe('inviteCreateSchema', () => {
  it('accepts no fields', () => {
    expect(inviteCreateSchema.parse({}).expiresInHours).toBeUndefined()
  })
  it('rejects negative or huge expiry', () => {
    expect(inviteCreateSchema.safeParse({ expiresInHours: 0 }).success).toBe(false)
    expect(inviteCreateSchema.safeParse({ expiresInHours: -1 }).success).toBe(false)
    expect(inviteCreateSchema.safeParse({ expiresInHours: 100_000 }).success).toBe(false)
  })
})

describe('billCreateSchema', () => {
  const validBase = {
    occurredOn: '2026-05-13',
    description: 'lunch',
    totalAmount: '100000',
    paidByMemberId: uuid,
    participantMemberIds: [uuid, uuid2],
  }

  it('coerces total amount string to bigint', () => {
    const p = billCreateSchema.parse(validBase)
    expect(typeof p.totalAmount).toBe('bigint')
    expect(p.totalAmount).toBe(100_000n)
  })

  it('also accepts numeric total', () => {
    const p = billCreateSchema.parse({ ...validBase, totalAmount: 12345 })
    expect(p.totalAmount).toBe(12_345n)
  })

  it('rejects zero total', () => {
    expect(billCreateSchema.safeParse({ ...validBase, totalAmount: '0' }).success).toBe(false)
  })

  it('rejects empty participant list', () => {
    expect(billCreateSchema.safeParse({ ...validBase, participantMemberIds: [] }).success).toBe(false)
  })

  it('rejects non-uuid participants', () => {
    expect(billCreateSchema.safeParse({ ...validBase, participantMemberIds: ['nope'] }).success).toBe(false)
  })
})

describe('settlementCreateSchema', () => {
  const valid = {
    fromMemberId: uuid,
    toMemberId: uuid2,
    amount: '50000',
    settledOn: '2026-05-14',
  }

  it('accepts a minimal payload', () => {
    const p = settlementCreateSchema.parse(valid)
    expect(p.amount).toBe(50_000n)
    expect(p.fromMemberId).toBe(uuid)
    expect(p.toMemberId).toBe(uuid2)
  })

  it('rejects same-member transfer', () => {
    expect(settlementCreateSchema.safeParse({ ...valid, toMemberId: uuid }).success).toBe(false)
  })

  it('rejects zero amount', () => {
    expect(settlementCreateSchema.safeParse({ ...valid, amount: '0' }).success).toBe(false)
  })

  it('accepts an optional note', () => {
    const p = settlementCreateSchema.parse({ ...valid, note: 'lunch payback' })
    expect(p.note).toBe('lunch payback')
  })
})
