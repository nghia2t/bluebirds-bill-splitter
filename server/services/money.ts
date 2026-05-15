// Money: single source of truth for parsing and formatting currency.
//
// Storage / wire format: bigint integer minor units.
//   - VND, JPY, KRW: minor unit = the currency itself (no decimals).
//   - USD, EUR, THB, SGD: minor unit = 1/100 of the currency (cents).
//
// Inputs come from humans who type things like "100k", "1.2tr", "12.50", "100.000".
// We accept the common shapes and reject everything else with a clear error.

import {
  CURRENCY_META,
  type Currency,
  type CurrencyMeta,
} from '../../shared/currency'

export class MoneyParseError extends Error {
  readonly code = 'MONEY_PARSE'
  constructor(message: string, readonly input: string) {
    super(message)
  }
}

/**
 * Parse a user-entered amount string into bigint minor units.
 *
 * VND accepts "100k" / "1.2tr" / "100.000" / plain digits; the suffix is the
 * explicit shorthand path, plain digits are always literal.
 */
export function parseAmount(
  rawInput: string,
  currency: Currency,
): bigint {
  if (typeof rawInput !== 'string') {
    throw new MoneyParseError('Amount must be a string', String(rawInput))
  }

  // Strip whitespace, the currency symbol, and stray non-breaking spaces.
  const meta = CURRENCY_META[currency]
  let input = rawInput.trim().replace(/\s+/g, '')
  if (input.length === 0) {
    throw new MoneyParseError('Empty amount', rawInput)
  }
  if (input.startsWith(meta.symbol)) input = input.slice(meta.symbol.length)
  if (input.endsWith(meta.symbol)) input = input.slice(0, -meta.symbol.length)
  // Back-compat: VND used to render with `đ` instead of `VND`; still strip it
  // so old screenshots / pasted text parse cleanly.
  if (currency === 'VND') {
    if (input.startsWith('đ')) input = input.slice(1)
    if (input.endsWith('đ'))   input = input.slice(0, -1)
  }

  if (currency === 'VND') return parseVnd(input, rawInput)
  return parseDecimal(input, meta.decimals, rawInput)
}

// ---------- VND ----------

function parseVnd(input: string, rawInput: string): bigint {
  // Accepts:
  //   - "100k" (×1,000), "1.2tr" / "1,2tr" (×1,000,000)
  //   - "100.000" / "100,000" (Vietnamese thousands separator → 100000)
  //   - "100000" plain digits (always literal)
  const lower = input.toLowerCase()

  // Suffix path.
  const suffixMatch = lower.match(/^(\d+(?:[.,]\d+)?)(k|tr)$/)
  if (suffixMatch) {
    const numericPart = suffixMatch[1]!.replace(',', '.')
    const multiplier = suffixMatch[2] === 'k' ? 1_000n : 1_000_000n
    const asFloat = Number(numericPart)
    if (!Number.isFinite(asFloat) || asFloat < 0) {
      throw new MoneyParseError('Bad VND suffix amount', rawInput)
    }
    // Avoid float in the bigint result: split into integer + fractional pieces.
    const [intPart, fracPart = ''] = numericPart.split('.')
    const fracDigits = fracPart.length
    const combined = BigInt(intPart + fracPart || '0')
    // combined / 10^fracDigits * multiplier
    const numerator = combined * multiplier
    const denominator = 10n ** BigInt(fracDigits)
    if (numerator % denominator !== 0n) {
      throw new MoneyParseError('VND amount has fractional dong', rawInput)
    }
    return numerator / denominator
  }

  // No suffix: strip dot/comma group separators, expect pure digits.
  const stripped = input.replace(/[.,]/g, '')
  if (!/^\d+$/.test(stripped)) {
    throw new MoneyParseError('Not a valid VND amount', rawInput)
  }
  return BigInt(stripped)
}

// ---------- decimal currencies (USD/EUR/THB/SGD) and zero-decimal (JPY/KRW) ----------

function parseDecimal(input: string, decimals: 0 | 2, rawInput: string): bigint {
  // Accept either '.' or ',' as decimal separator and either as thousands
  // separator — we infer by position: the last separator that has 1-2 digits
  // after it is the decimal sep when decimals === 2.
  const cleaned = input.replace(/[^\d.,-]/g, '')
  if (cleaned.length === 0) throw new MoneyParseError('Not a number', rawInput)

  let sign = 1n
  let body = cleaned
  if (body.startsWith('-')) {
    sign = -1n
    body = body.slice(1)
  }
  if (!/^[\d.,]+$/.test(body)) throw new MoneyParseError('Not a number', rawInput)

  if (decimals === 0) {
    const digits = body.replace(/[.,]/g, '')
    if (!/^\d+$/.test(digits)) throw new MoneyParseError('Not an integer amount', rawInput)
    return sign * BigInt(digits)
  }

  // decimals === 2
  // Find the last '.' or ',' and treat it as the decimal point only if
  // 1-2 digits follow.  Everything before it: strip remaining separators.
  const lastDot = body.lastIndexOf('.')
  const lastComma = body.lastIndexOf(',')
  const lastSep = Math.max(lastDot, lastComma)
  let intStr: string
  let fracStr: string
  if (lastSep === -1) {
    intStr = body
    fracStr = ''
  } else {
    const tailLen = body.length - lastSep - 1
    if (tailLen >= 1 && tailLen <= 2) {
      intStr = body.slice(0, lastSep).replace(/[.,]/g, '')
      fracStr = body.slice(lastSep + 1)
    } else {
      // No real decimal — separators are just thousands.
      intStr = body.replace(/[.,]/g, '')
      fracStr = ''
    }
  }
  if (!/^\d*$/.test(intStr) || !/^\d*$/.test(fracStr)) {
    throw new MoneyParseError('Not a number', rawInput)
  }
  const padded = (fracStr + '00').slice(0, 2)
  const combined = BigInt((intStr || '0') + padded)
  return sign * combined
}

// ---------- formatting ----------

export type DisplayStyle = 'compact' | 'verbose'

/**
 * Format a bigint amount in minor units for display.
 *
 * - 'verbose' is the human-grade form used on receipts/totals
 *   ("100.000 đ", "$12.50", "¥1,200").
 * - 'compact' is the dense form used in lists / FAB previews;
 *   VND gets `k`/`tr` suffixes ("100k", "1.2tr"). Other currencies match verbose.
 */
export function formatAmount(
  amount: bigint,
  currency: Currency,
  style: DisplayStyle = 'verbose',
): string {
  const meta = CURRENCY_META[currency]
  if (currency === 'VND' && style === 'compact') return formatVndCompact(amount)

  const negative = amount < 0n
  const abs = negative ? -amount : amount

  if (meta.decimals === 0) {
    const grouped = groupDigits(abs.toString(), meta.thousandsSep)
    return assemble(meta, grouped, negative)
  }

  // decimals === 2
  const str = abs.toString().padStart(3, '0')
  const intPart = str.slice(0, -2)
  const fracPart = str.slice(-2)
  const grouped = groupDigits(intPart, meta.thousandsSep)
  return assemble(meta, `${grouped}${meta.decimalSep}${fracPart}`, negative)
}

function assemble(meta: CurrencyMeta, body: string, negative: boolean): string {
  const sign = negative ? '-' : ''
  // VND historically uses the symbol after the amount; others before.
  if (meta.code === 'VND') return `${sign}${body} ${meta.symbol}`
  return `${sign}${meta.symbol}${body}`
}

function groupDigits(digits: string, sep: string): string {
  if (digits.length <= 3) return digits
  const head = digits.length % 3
  const parts: string[] = []
  if (head > 0) parts.push(digits.slice(0, head))
  for (let i = head; i < digits.length; i += 3) parts.push(digits.slice(i, i + 3))
  return parts.join(sep)
}

// Compact VND = the same dot-grouped digits as verbose, just without the
// trailing `VND` symbol.  No `k` / `tr` shorthand — the team preferred the
// honest, full-digit form everywhere.
function formatVndCompact(amount: bigint): string {
  const negative = amount < 0n
  const abs = negative ? -amount : amount
  const sign = negative ? '-' : ''
  return `${sign}${groupDigits(abs.toString(), '.')}`
}

// ---------- equal split ----------

/**
 * Split `total` into `n` shares as evenly as possible.
 *
 * The first `remainder` shares are 1 larger than the rest, so the sum is exactly `total`.
 * The caller is responsible for assigning shares to members in a deterministic order
 * (we sort by team_member_id at the call site for stability).
 *
 * Returns an array of length `n`.  Throws on n <= 0 or total < 0.
 */
export function equalSplit(total: bigint, n: number): bigint[] {
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`equalSplit: n must be a positive integer, got ${n}`)
  }
  if (total < 0n) throw new Error(`equalSplit: total must be non-negative, got ${total}`)
  const big = BigInt(n)
  const base = total / big
  const remainder = Number(total - base * big)
  return Array.from({ length: n }, (_, i) => (i < remainder ? base + 1n : base))
}
