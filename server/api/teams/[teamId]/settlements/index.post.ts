// POST /api/teams/:teamId/settlements — record a payment between two members.
// In the running-ledger model this is the "I just paid X" action; it reduces
// the from-member's debt immediately in the live balance computation.

import { settlementCreateSchema, uuidSchema } from '../../../../../shared/schemas'
import { createSettlement } from '../../../../db/settlements'
import { requireTeamAccess, requireUser } from '../../../../utils/auth'
import { createApiError } from '../../../../utils/errors'
import { withIdempotency } from '../../../../utils/idempotency'

export default defineEventHandler(async (event) => {
  const teamId = getRouterParam(event, 'teamId') ?? ''
  if (!uuidSchema.safeParse(teamId).success) throw createApiError('NOT_FOUND')

  await requireTeamAccess(event, teamId)
  const user = await requireUser(event)

  const parsed = await readValidatedBody(event, (b) => settlementCreateSchema.safeParse(b))
  if (!parsed.success) {
    throw createApiError('VALIDATION', 'Invalid settlement payload', parsed.error.flatten())
  }

  return withIdempotency(
    event,
    'POST /api/teams/:teamId/settlements',
    user.id,
    () => createSettlement({
      teamId,
      fromMemberId: parsed.data.fromMemberId,
      toMemberId: parsed.data.toMemberId,
      amount: parsed.data.amount,
      settledOn: parsed.data.settledOn,
      note: parsed.data.note ?? null,
      createdBy: user.id,
    }),
  )
})
