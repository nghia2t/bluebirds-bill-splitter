import { describe, expect, it } from 'vitest'
import { generateInviteToken, isWellFormedToken } from '../../server/utils/invite-tokens'

describe('generateInviteToken', () => {
  it('produces a base64url string of the expected length', () => {
    const t = generateInviteToken()
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('produces unique tokens across many draws', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 5000; i++) seen.add(generateInviteToken())
    expect(seen.size).toBe(5000)
  })

  it('contains no URL-unsafe characters', () => {
    for (let i = 0; i < 200; i++) {
      const t = generateInviteToken()
      expect(t.includes('+')).toBe(false)
      expect(t.includes('/')).toBe(false)
      expect(t.includes('=')).toBe(false)
    }
  })
})

describe('isWellFormedToken', () => {
  it('accepts tokens we generate', () => {
    for (let i = 0; i < 50; i++) {
      expect(isWellFormedToken(generateInviteToken())).toBe(true)
    }
  })

  it('rejects wrong-shape values cheaply', () => {
    expect(isWellFormedToken('')).toBe(false)
    expect(isWellFormedToken('too-short')).toBe(false)
    expect(isWellFormedToken('a'.repeat(42))).toBe(false)
    expect(isWellFormedToken('a'.repeat(44))).toBe(false)
    expect(isWellFormedToken('a'.repeat(43) + '!')).toBe(false)   // 44 chars
    expect(isWellFormedToken('A'.repeat(42) + '+')).toBe(false)   // bad char
    expect(isWellFormedToken(null)).toBe(false)
    expect(isWellFormedToken(undefined)).toBe(false)
    expect(isWellFormedToken(12345)).toBe(false)
    expect(isWellFormedToken({ token: 'x' })).toBe(false)
  })
})
