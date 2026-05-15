import { describe, expect, it } from 'vitest'
import { createApiError, isApiErrorBody } from '../../server/utils/errors'

describe('createApiError', () => {
  it('maps each code to the spec status', () => {
    const cases: Array<[Parameters<typeof createApiError>[0], number]> = [
      ['UNAUTHORIZED', 401],
      ['FORBIDDEN', 403],
      ['NOT_FOUND', 404],
      ['VALIDATION', 422],
      ['INVALID_INVITE', 410],
      ['ALREADY_MEMBER', 409],
      ['CURRENCY_MISMATCH', 422],
      ['INTERNAL', 500],
    ]
    for (const [code, status] of cases) {
      const err = createApiError(code)
      expect(err.statusCode).toBe(status)
      expect(err.statusMessage).toBe(code)
    }
  })

  it('attaches the envelope as data with optional details', () => {
    const err = createApiError('VALIDATION', 'bad email', { field: 'email' })
    expect(err.data).toEqual({
      error: { code: 'VALIDATION', message: 'bad email', details: { field: 'email' } },
    })
  })

  it('omits details when not provided', () => {
    const err = createApiError('FORBIDDEN', 'no access')
    expect(err.data).toEqual({
      error: { code: 'FORBIDDEN', message: 'no access' },
    })
  })

  it('falls back to the code when no message is given', () => {
    const err = createApiError('UNAUTHORIZED')
    expect(err.data).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'UNAUTHORIZED' },
    })
  })
})

describe('isApiErrorBody', () => {
  it('accepts well-formed envelopes', () => {
    expect(isApiErrorBody({ error: { code: 'FORBIDDEN', message: 'x' } })).toBe(true)
    expect(isApiErrorBody({ error: { code: 'NOT_FOUND', message: 'x', details: 1 } })).toBe(true)
  })

  it('rejects unknown codes', () => {
    expect(isApiErrorBody({ error: { code: 'BANANAS', message: 'x' } })).toBe(false)
  })

  it('rejects malformed shapes', () => {
    expect(isApiErrorBody(null)).toBe(false)
    expect(isApiErrorBody({})).toBe(false)
    expect(isApiErrorBody({ error: 'oops' })).toBe(false)
    expect(isApiErrorBody({ error: { message: 'x' } })).toBe(false)
  })
})
