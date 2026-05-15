// Zod schemas shared between client (form validation) and server (authoritative
// validation in route handlers).  Keep these tight — the server does NOT trust
// the browser, so every write endpoint re-parses with the same schema via
// `readValidatedBody`.

import { z } from 'zod'
import { CURRENCIES } from './currency'

// ---------- primitives ----------

export const uuidSchema = z.string().uuid()
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')

const trimmedNonEmpty = (max: number) =>
  z.string().trim().min(1, 'required').max(max)

// bigint over the wire: clients send strings (JSON has no bigint), the server
// coerces back to bigint here.  We accept positive integers only — every
// monetary value in this app is in minor units, so 0 has no meaning for a
// bill total.
const bigintFromString = z.union([
  z.string().regex(/^\d+$/, 'must be a positive integer string'),
  z.number().int().nonnegative(),
]).transform((v) => BigInt(v))

// ---------- teams ----------

export const teamCreateSchema = z.object({
  name: trimmedNonEmpty(80),
  defaultCurrency: z.enum(CURRENCIES).default('VND'),
  timezone: trimmedNonEmpty(64).default('Asia/Ho_Chi_Minh'),
})
export type TeamCreateInput = z.infer<typeof teamCreateSchema>

// PATCH allows partial updates. We don't gate currency changes here — the
// running-ledger model snapshots `currency` on each bill / settlement at
// write time, so flipping the team default only affects future writes.
export const teamUpdateSchema = z.object({
  name: trimmedNonEmpty(80).optional(),
  defaultCurrency: z.enum(CURRENCIES).optional(),
  timezone: trimmedNonEmpty(64).optional(),
}).refine((v) => Object.keys(v).length > 0, { message: 'no fields to update' })
export type TeamUpdateInput = z.infer<typeof teamUpdateSchema>

// ---------- members ----------

export const memberUpdateSchema = z.object({
  displayName: trimmedNonEmpty(60).optional(),
  paymentInfo: z.string().trim().max(2000).nullable().optional(),
}).refine((v) => Object.keys(v).length > 0, { message: 'no fields to update' })
export type MemberUpdateInput = z.infer<typeof memberUpdateSchema>

// Owner-only: promote another active member to owner. The previous owner
// stays an owner unless they also explicitly demote themselves; this matches
// the "transfer ownership before leaving" flow without forcing a demotion.
export const memberRolePatchSchema = z.object({
  role: z.enum(['owner', 'member']),
})
export type MemberRolePatchInput = z.infer<typeof memberRolePatchSchema>

// ---------- invites ----------

export const inviteCreateSchema = z.object({
  expiresInHours: z.number().int().positive().max(24 * 365).optional(),
})
export type InviteCreateInput = z.infer<typeof inviteCreateSchema>

// ---------- bills ----------

// Per-participant share. Used by the "exact" split path: caller supplies the
// share for each included member and the server persists those amounts as-is
// after validating they sum to the bill total.
export const participantShareSchema = z.object({
  memberId: uuidSchema,
  shareAmount: bigintFromString,
})
export type ParticipantShareInput = z.infer<typeof participantShareSchema>

const participantSharesArray = z.array(participantShareSchema).min(1).max(200)

export const billCreateSchema = z.object({
  occurredOn: isoDateSchema,
  description: trimmedNonEmpty(140),
  note: z.string().trim().max(500).nullable().optional(),
  totalAmount: bigintFromString,
  paidByMemberId: uuidSchema,
  // Caller picks the split path: `participantMemberIds` for an equal split
  // (server computes shares with `equalSplit`), or `participantShares` for the
  // "exact" path (server validates and persists the supplied amounts as-is).
  participantMemberIds: z.array(uuidSchema).min(1).max(200).optional(),
  participantShares: participantSharesArray.optional(),
})
  .refine((v) => v.totalAmount > 0n, { message: 'totalAmount must be > 0' })
  .refine(
    (v) => Boolean(v.participantMemberIds) !== Boolean(v.participantShares),
    { message: 'pass exactly one of participantMemberIds or participantShares' },
  )
export type BillCreateInput = z.infer<typeof billCreateSchema>

// Edit allows the same set as create, all optional. Re-splitting happens at
// the handler level (any of total/participants change → recompute shares).
// `note` accepts null explicitly so a user can clear the field.
export const billUpdateSchema = z.object({
  occurredOn: isoDateSchema.optional(),
  description: trimmedNonEmpty(140).optional(),
  note: z.string().trim().max(500).nullable().optional(),
  totalAmount: bigintFromString.optional(),
  paidByMemberId: uuidSchema.optional(),
  participantMemberIds: z.array(uuidSchema).min(1).max(200).optional(),
  participantShares: participantSharesArray.optional(),
})
  .refine((v) => Object.keys(v).length > 0, { message: 'no fields to update' })
  .refine(
    (v) => !(v.participantMemberIds && v.participantShares),
    { message: 'pass at most one of participantMemberIds or participantShares' },
  )
export type BillUpdateInput = z.infer<typeof billUpdateSchema>

// ---------- settlements ----------
// A settlement is a recorded payment between two team members — the act of
// "I paid B today".  There's no paid/unpaid toggle (recording IS the
// payment); removing a settlement is the way to undo a mistake.

export const settlementCreateSchema = z.object({
  fromMemberId: uuidSchema,
  toMemberId: uuidSchema,
  amount: bigintFromString,
  settledOn: isoDateSchema,
  note: z.string().trim().max(280).optional(),
})
  .refine((v) => v.amount > 0n, { message: 'amount must be > 0' })
  .refine((v) => v.fromMemberId !== v.toMemberId, {
    message: 'fromMemberId and toMemberId must differ',
  })
export type SettlementCreateInput = z.infer<typeof settlementCreateSchema>
