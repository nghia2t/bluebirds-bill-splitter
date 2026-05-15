// GET /api/teams/:teamId/ledger — the team dashboard's combined view.  One
// request returns members + bills + settlements + computed balances + a
// suggested transfer plan, so the page doesn't need to fan out and the
// numbers can't drift between sub-requests.

import { uuidSchema } from '../../../../shared/schemas'
import { listBillsForTeam } from '../../../db/bills'
import { listSettlementsForTeam } from '../../../db/settlements'
import { listActiveMembers } from '../../../db/teams'
import { buildLedgerView } from '../../../services/team-ledger'
import { requireTeamAccess } from '../../../utils/auth'
import { createApiError } from '../../../utils/errors'

export default defineEventHandler(async (event) => {
  const teamId = getRouterParam(event, 'teamId') ?? ''
  if (!uuidSchema.safeParse(teamId).success) throw createApiError('NOT_FOUND')

  await requireTeamAccess(event, teamId)

  const [members, bills, settlements] = await Promise.all([
    listActiveMembers(teamId),
    listBillsForTeam(teamId),
    listSettlementsForTeam(teamId),
  ])

  const view = buildLedgerView({
    members: members.map((m) => ({ id: m.id, displayName: m.displayName })),
    bills: bills.map((b) => ({
      id: b.id,
      occurredOn: b.occurredOn,
      description: b.description,
      totalAmount: b.totalAmount,
      paidByMemberId: b.paidByMemberId,
      participants: b.participants.map((p) => ({
        memberId: p.teamMemberId,
        shareAmount: p.shareAmount,
      })),
    })),
    settlements: settlements.map((s) => ({
      id: s.id,
      fromMemberId: s.fromMemberId,
      toMemberId: s.toMemberId,
      amount: s.amount,
      settledOn: s.settledOn,
    })),
  })

  return { members, bills, settlements, view }
})
