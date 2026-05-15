import { describe, expect, it } from 'vitest'
import {
  MoneyParseError,
  equalSplit,
  formatAmount,
  parseAmount,
} from '../../server/services/money'

describe('parseAmount — VND literal mode', () => {
  it('treats plain digits as literal dong', () => {
    expect(parseAmount('100', 'VND')).toBe(100n)
    expect(parseAmount('100000', 'VND')).toBe(100_000n)
  })

  it('strips dot/comma thousands separators', () => {
    expect(parseAmount('100.000', 'VND')).toBe(100_000n)
    expect(parseAmount('1,200,000', 'VND')).toBe(1_200_000n)
  })

  it('expands k/tr suffixes', () => {
    expect(parseAmount('100k', 'VND')).toBe(100_000n)
    expect(parseAmount('1.2tr', 'VND')).toBe(1_200_000n)
    expect(parseAmount('1,5tr', 'VND')).toBe(1_500_000n)
  })

  it('strips VND symbol', () => {
    expect(parseAmount('100.000 đ', 'VND')).toBe(100_000n)
  })

  it('rejects fractional dong from suffix math', () => {
    // 1.234k → 1234 dong (lossless), fine
    expect(parseAmount('1.234k', 'VND')).toBe(1_234n)
    // 1.2345k → 1234.5 dong, would round; reject.
    expect(() => parseAmount('1.2345k', 'VND')).toThrow(MoneyParseError)
  })

  it('rejects garbage', () => {
    expect(() => parseAmount('', 'VND')).toThrow(MoneyParseError)
    expect(() => parseAmount('abc', 'VND')).toThrow(MoneyParseError)
    expect(() => parseAmount('100q', 'VND')).toThrow(MoneyParseError)
  })
})

describe('parseAmount — decimal currencies (USD)', () => {
  it('parses dollars and cents', () => {
    expect(parseAmount('12.50', 'USD')).toBe(1250n)
    expect(parseAmount('0.05', 'USD')).toBe(5n)
    expect(parseAmount('100', 'USD')).toBe(10_000n)
  })

  it('handles thousands separators', () => {
    expect(parseAmount('1,200.50', 'USD')).toBe(120_050n)
  })

  it('accepts the $ symbol', () => {
    expect(parseAmount('$12.50', 'USD')).toBe(1250n)
  })

  it('pads single-digit fractions', () => {
    expect(parseAmount('5.5', 'USD')).toBe(550n)
  })

  it('rejects nonsense', () => {
    expect(() => parseAmount('abc', 'USD')).toThrow(MoneyParseError)
    expect(() => parseAmount('', 'USD')).toThrow(MoneyParseError)
  })
})

describe('parseAmount — zero-decimal currencies (JPY/KRW)', () => {
  it('parses integers only', () => {
    expect(parseAmount('1200', 'JPY')).toBe(1200n)
    expect(parseAmount('1,200', 'JPY')).toBe(1200n)
    expect(parseAmount('100000', 'KRW')).toBe(100_000n)
  })
})

describe('formatAmount — VND', () => {
  it('verbose adds VND symbol after amount with dot thousands', () => {
    expect(formatAmount(100_000n, 'VND')).toBe('100.000 VND')
    expect(formatAmount(999n, 'VND')).toBe('999 VND')
    expect(formatAmount(1_234_567n, 'VND')).toBe('1.234.567 VND')
  })

  it('compact is full digits with dot thousands separators (no k/tr suffix)', () => {
    expect(formatAmount(999n, 'VND', 'compact')).toBe('999')
    expect(formatAmount(1_000n, 'VND', 'compact')).toBe('1.000')
    expect(formatAmount(100_000n, 'VND', 'compact')).toBe('100.000')
    expect(formatAmount(999_999n, 'VND', 'compact')).toBe('999.999')
    expect(formatAmount(1_200_000n, 'VND', 'compact')).toBe('1.200.000')
    expect(formatAmount(12_500_000n, 'VND', 'compact')).toBe('12.500.000')
    expect(formatAmount(1_999_000n, 'VND', 'compact')).toBe('1.999.000')
  })
})

describe('formatAmount — other currencies', () => {
  it('USD verbose', () => {
    expect(formatAmount(1250n, 'USD')).toBe('$12.50')
    expect(formatAmount(5n, 'USD')).toBe('$0.05')
    expect(formatAmount(120_050n, 'USD')).toBe('$1,200.50')
  })

  it('EUR verbose uses dot thousands and comma decimal', () => {
    expect(formatAmount(1250n, 'EUR')).toBe('€12,50')
    expect(formatAmount(120_050n, 'EUR')).toBe('€1.200,50')
  })

  it('JPY/KRW have no decimals', () => {
    expect(formatAmount(1200n, 'JPY')).toBe('¥1,200')
    expect(formatAmount(100_000n, 'KRW')).toBe('₩100,000')
  })

  it('negatives keep the minus before the symbol', () => {
    expect(formatAmount(-1250n, 'USD')).toBe('-$12.50')
    expect(formatAmount(-100_000n, 'VND')).toBe('-100.000 VND')
  })
})

describe('equalSplit', () => {
  it('handles exact division', () => {
    expect(equalSplit(900n, 3)).toEqual([300n, 300n, 300n])
  })

  it('puts remainder on the first participants', () => {
    expect(equalSplit(700n, 3)).toEqual([234n, 233n, 233n])
    expect(equalSplit(10n, 3)).toEqual([4n, 3n, 3n])
  })

  it('sums back to the total', () => {
    for (const total of [1n, 7n, 100n, 999n, 1_234_567n]) {
      for (const n of [1, 2, 3, 5, 7, 13]) {
        const shares = equalSplit(total, n)
        const sum = shares.reduce((a, b) => a + b, 0n)
        expect(sum).toBe(total)
      }
    }
  })

  it('handles single participant', () => {
    expect(equalSplit(500n, 1)).toEqual([500n])
  })

  it('handles zero total', () => {
    expect(equalSplit(0n, 4)).toEqual([0n, 0n, 0n, 0n])
  })

  it('rejects invalid n', () => {
    expect(() => equalSplit(100n, 0)).toThrow()
    expect(() => equalSplit(100n, -1)).toThrow()
    expect(() => equalSplit(100n, 1.5)).toThrow()
  })

  it('rejects negative total', () => {
    expect(() => equalSplit(-1n, 3)).toThrow()
  })
})
