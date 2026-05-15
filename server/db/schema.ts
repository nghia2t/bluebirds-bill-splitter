// Drizzle schema for BlueBirds Bill Splitter.
// Monetary columns are bigint integer minor units (VND has no decimals; USD = cents).
//
// v2 model: cycles are gone.  Each team is a single running ledger — bills
// hang directly off teams, balances are computed live from (bills − bill
// shares + ad-hoc settlements), and a Settlement is now just a recorded
// payment between two members (no paid/unpaid toggle, no cycle-close phase).

import { sql } from 'drizzle-orm'
import {
  bigint,
  date,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

// ---------- users ----------

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  googleSub: text('google_sub').notNull().unique(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  avatarUrl: text('avatar_url'),
  preferredLang: text('preferred_lang').notNull().default('en'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ---------- teams ----------

export const teams = pgTable('teams', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  defaultCurrency: text('default_currency').notNull().default('VND'),
  timezone: text('timezone').notNull().default('Asia/Ho_Chi_Minh'),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ---------- team_members ----------
// The unit of "person" inside a team. Soft-remove preserves historical bills.
// `user_id` is nullable so we can support name-only placeholders later.

export const teamMembers = pgTable(
  'team_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    teamId: uuid('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id),
    displayName: text('display_name').notNull(),
    paymentInfo: text('payment_info'),
    role: text('role').notNull().default('member'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    removedAt: timestamp('removed_at', { withTimezone: true }),
  },
  (t) => [
    // One (team, user) row per real user; placeholders (user_id null) can repeat.
    uniqueIndex('team_members_team_user_uq')
      .on(t.teamId, t.userId)
      .where(sql`${t.userId} IS NOT NULL`),
    index('team_members_team_idx').on(t.teamId),
  ],
)

// ---------- team_invites ----------

export const teamInvites = pgTable('team_invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  teamId: uuid('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
})

// ---------- bills ----------
// Live on the team directly.  `currency` is snapshotted at write time so a
// later team-currency change doesn't retroactively re-interpret old amounts.

export const bills = pgTable(
  'bills',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    teamId: uuid('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
    occurredOn: date('occurred_on').notNull(),
    description: text('description').notNull(),
    /** Optional free-text detail captured alongside the bill ("split with X + Y", etc.). */
    note: text('note'),
    totalAmount: bigint('total_amount', { mode: 'bigint' }).notNull(),
    currency: text('currency').notNull(),
    paidByMemberId: uuid('paid_by').notNull().references(() => teamMembers.id),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('bills_team_idx').on(t.teamId)],
)

// ---------- bill_participants ----------
// share_amount is stored at write time so equal-split with remainder reconciles exactly.

export const billParticipants = pgTable(
  'bill_participants',
  {
    billId: uuid('bill_id').notNull().references(() => bills.id, { onDelete: 'cascade' }),
    teamMemberId: uuid('team_member_id').notNull().references(() => teamMembers.id),
    shareAmount: bigint('share_amount', { mode: 'bigint' }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.billId, t.teamMemberId] }),
    index('bill_participants_member_idx').on(t.teamMemberId),
  ],
)

// ---------- settlements ----------
// Ad-hoc record of a payment between two team members ("A paid B 50k on the
// 12th").  There is no paid/unpaid toggle — recording a settlement IS the act
// of marking it paid.  Settlements reduce the from-member's debt in the live
// balance computation.

export const settlements = pgTable(
  'settlements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    teamId: uuid('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
    fromMemberId: uuid('from_member_id').notNull().references(() => teamMembers.id),
    toMemberId: uuid('to_member_id').notNull().references(() => teamMembers.id),
    amount: bigint('amount', { mode: 'bigint' }).notNull(),
    currency: text('currency').notNull(),
    settledOn: date('settled_on').notNull(),
    note: text('note'),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('settlements_team_idx').on(t.teamId)],
)

// ---------- idempotency_keys ----------
// Retry-safe POSTs over flaky mobile networks. TTL'd after 24h by a cleanup job (later).

export const idempotencyKeys = pgTable('idempotency_keys', {
  key: text('key').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  endpoint: text('endpoint').notNull(),
  responseBody: jsonb('response_body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// Convenience: a single namespace of inferred types.
export type User = typeof users.$inferSelect
export type Team = typeof teams.$inferSelect
export type TeamMember = typeof teamMembers.$inferSelect
export type TeamInvite = typeof teamInvites.$inferSelect
export type Bill = typeof bills.$inferSelect
export type BillParticipant = typeof billParticipants.$inferSelect
export type Settlement = typeof settlements.$inferSelect
