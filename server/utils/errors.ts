// Error envelope: a small, stable set of codes the client maps to localized
// messages in i18n/locales/<lang>.json under `errors.<CODE>`. Everything that
// reaches the client error path goes through `createApiError` so the shape stays
// consistent: { error: { code, message, details? } }.

import { createError } from 'h3'

export const ErrorCodes = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION: 'VALIDATION',
  INVALID_INVITE: 'INVALID_INVITE',
  ALREADY_MEMBER: 'ALREADY_MEMBER',
  CURRENCY_MISMATCH: 'CURRENCY_MISMATCH',
  INTERNAL: 'INTERNAL',
} as const

export type ErrorCode = keyof typeof ErrorCodes

const STATUS_FOR: Record<ErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
  INVALID_INVITE: 410,
  ALREADY_MEMBER: 409,
  CURRENCY_MISMATCH: 422,
  INTERNAL: 500,
}

export interface ApiErrorBody {
  error: {
    code: ErrorCode
    message: string
    details?: unknown
  }
}

/**
 * Throw a stable, client-recognisable error from any Nitro handler.
 *
 *   throw createApiError('FORBIDDEN', 'Not a member of this team')
 *
 * The thrown value is an h3 error with `statusCode` set; we attach the rich
 * envelope as `data` so the global error handler can serialise it without
 * needing to know about our codes.
 */
export function createApiError(
  code: ErrorCode,
  message?: string,
  details?: unknown,
): ReturnType<typeof createError> {
  const body: ApiErrorBody = {
    error: {
      code,
      message: message ?? code,
      ...(details === undefined ? {} : { details }),
    },
  }
  return createError({
    statusCode: STATUS_FOR[code],
    statusMessage: code,
    data: body,
  })
}

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null) return false
  const e = (value as { error?: unknown }).error
  if (typeof e !== 'object' || e === null) return false
  const code = (e as { code?: unknown }).code
  return typeof code === 'string' && code in ErrorCodes
}
