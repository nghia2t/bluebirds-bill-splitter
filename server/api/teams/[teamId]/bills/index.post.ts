// POST /api/teams/:teamId/bills — add a bill to the team's running ledger.
// Honours `Idempotency-Key` so repeated taps on a flaky mobile network don't
// create duplicate bills.

import { billCreateSchema, uuidSchema } from '../../../../../shared/schemas'
import { createBill } from '../../../../db/bills'
import { requireTeamAccess, requireUser } from '../../../../utils/auth'
import { createApiError } from '../../../../utils/errors'
import { withIdempotency } from '../../../../utils/idempotency'

export default defineEventHandler(async (event) => {
  const teamId = getRouterParam(event, 'teamId') ?? ''
  if (!uuidSchema.safeParse(teamId).success) throw createApiError('NOT_FOUND')

  await requireTeamAccess(event, teamId)
  const user = await requireUser(event)

  const parsed = await readValidatedBody(event, (b) => billCreateSchema.safeParse(b))
  if (!parsed.success) {
    throw createApiError('VALIDATION', 'Invalid bill payload', parsed.error.flatten())
  }

  return withIdempotency(
    event,
    'POST /api/teams/:teamId/bills',
    user.id,
    () => createBill({
      teamId,
      occurredOn: parsed.data.occurredOn,
      description: parsed.data.description,
      note: parsed.data.note ?? null,
      totalAmount: parsed.data.totalAmount,
      paidByMemberId: parsed.data.paidByMemberId,
      participantMemberIds: parsed.data.participantMemberIds,
      participantShares: parsed.data.participantShares,
      createdBy: user.id,
    }),
  )
})
