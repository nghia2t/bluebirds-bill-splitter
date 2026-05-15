// DELETE /api/bills/:billId — open cycle only.

import { uuidSchema } from '../../../../shared/schemas'
import { deleteBill, getTeamIdForBill } from '../../../db/bills'
import { requireTeamAccess } from '../../../utils/auth'
import { createApiError } from '../../../utils/errors'

export default defineEventHandler(async (event) => {
  const billId = getRouterParam(event, 'billId') ?? ''
  if (!uuidSchema.safeParse(billId).success) throw createApiError('NOT_FOUND')

  const teamId = await getTeamIdForBill(billId)
  if (!teamId) throw createApiError('NOT_FOUND')

  await requireTeamAccess(event, teamId)
  await deleteBill(billId)
  return { ok: true }
})
