// PATCH /api/bills/:billId — open cycle only.

import { billUpdateSchema, uuidSchema } from '../../../../shared/schemas'
import { getTeamIdForBill, updateBill } from '../../../db/bills'
import { requireTeamAccess } from '../../../utils/auth'
import { createApiError } from '../../../utils/errors'

export default defineEventHandler(async (event) => {
  const billId = getRouterParam(event, 'billId') ?? ''
  if (!uuidSchema.safeParse(billId).success) throw createApiError('NOT_FOUND')

  const teamId = await getTeamIdForBill(billId)
  if (!teamId) throw createApiError('NOT_FOUND')

  await requireTeamAccess(event, teamId)

  const parsed = await readValidatedBody(event, (b) => billUpdateSchema.safeParse(b))
  if (!parsed.success) {
    throw createApiError('VALIDATION', 'Invalid bill patch', parsed.error.flatten())
  }

  return updateBill({ billId, patch: parsed.data })
})
