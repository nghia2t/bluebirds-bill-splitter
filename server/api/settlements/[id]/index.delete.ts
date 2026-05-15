// DELETE /api/settlements/:id — undo a recorded payment.  In the
// running-ledger model this is the only way to "edit" a settlement; the
// user records a fresh one if they entered the wrong amount.

import { uuidSchema } from '../../../../shared/schemas'
import { deleteSettlement, getTeamIdForSettlement } from '../../../db/settlements'
import { requireTeamAccess } from '../../../utils/auth'
import { createApiError } from '../../../utils/errors'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') ?? ''
  if (!uuidSchema.safeParse(id).success) throw createApiError('NOT_FOUND')

  const teamId = await getTeamIdForSettlement(id)
  if (!teamId) throw createApiError('NOT_FOUND')

  await requireTeamAccess(event, teamId)
  await deleteSettlement(id)
  return { ok: true }
})
