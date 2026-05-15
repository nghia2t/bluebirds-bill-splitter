// Client mirror of server/services/money.ts.  Same parsing/formatting rules,
// bound to a per-team `currency` so callers don't have to thread it through
// every UI component.

import {
  CURRENCY_META,
  type Currency,
} from '~~/shared/currency'

export interface UseMoneyArgs {
  currency: Currency
}

// Bigints arrive from the server as JSON strings (see bigint-json plugin).
// Accept the full union here so call sites don't have to pre-convert.
type BigintLike = bigint | string | number

function toBigint(value: BigintLike): bigint {
  if (typeof value === 'bigint') return value
  if (typeof value === 'number') return BigInt(value)
  return BigInt(value)
}

export function useMoney(args: UseMoneyArgs) {
  const meta = CURRENCY_META[args.currency]

  function format(amount: BigintLike, style: 'compact' | 'verbose' = 'verbose'): string {
    const v = toBigint(amount)
    if (args.currency === 'VND' && style === 'compact') return formatVndCompact(v)
    return formatGeneric(v, meta)
  }

  function parse(input: string): bigint {
    if (args.currency === 'VND') return parseVnd(input)
    return parseDecimal(input, meta.decimals)
  }

  /** Best-effort live preview that returns null on parse error instead of throwing. */
  function tryParse(input: string): bigint | null {
    try { return parse(input) } catch { return null }
  }

  return { format, parse, tryParse, meta }
}

// ---------- inline copies of the server formatter (kept tiny on purpose) ----------

function formatGeneric(amount: bigint, meta: typeof CURRENCY_META[Currency]) {
  const negative = amount < 0n
  const abs = negative ? -amount : amount
  let body: string
  if (meta.decimals === 0) {
    body = groupDigits(abs.toString(), meta.thousandsSep)
  } else {
    const str = abs.toString().padStart(3, '0')
    const intPart = str.slice(0, -2)
    const fracPart = str.slice(-2)
    body = `${groupDigits(intPart, meta.thousandsSep)}${meta.decimalSep}${fracPart}`
  }
  const sign = negative ? '-' : ''
  return meta.code === 'VND' ? `${sign}${body} ${meta.symbol}` : `${sign}${meta.symbol}${body}`
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

// ---------- parsing ----------

function parseVnd(rawInput: string): bigint {
  let input = rawInput.trim().replace(/\s+/g, '')
  // Accept either suffix — `VND` is the current display symbol, `đ` is the
  // historical one (still found in pasted text and screenshots).
  if (input.endsWith('VND')) input = input.slice(0, -3).trim()
  else if (input.endsWith('đ')) input = input.slice(0, -1).trim()
  if (input.length === 0) throw new Error('Empty amount')

  const lower = input.toLowerCase()
  const suffixMatch = lower.match(/^(\d+(?:[.,]\d+)?)(k|tr)$/)
  if (suffixMatch) {
    const numericPart = suffixMatch[1]!.replace(',', '.')
    const multiplier = suffixMatch[2] === 'k' ? 1_000n : 1_000_000n
    const [intPart, fracPart = ''] = numericPart.split('.')
    const fracDigits = fracPart.length
    const combined = BigInt(intPart + fracPart || '0')
    const numerator = combined * multiplier
    const denominator = 10n ** BigInt(fracDigits)
    if (numerator % denominator !== 0n) throw new Error('VND amount has fractional dong')
    return numerator / denominator
  }

  const stripped = input.replace(/[.,]/g, '')
  if (!/^\d+$/.test(stripped)) throw new Error('Not a valid VND amount')
  return BigInt(stripped)
}

function parseDecimal(rawInput: string, decimals: 0 | 2): bigint {
  const cleaned = rawInput.trim().replace(/[^\d.,-]/g, '')
  if (cleaned.length === 0) throw new Error('Not a number')
  let sign = 1n
  let body = cleaned
  if (body.startsWith('-')) { sign = -1n; body = body.slice(1) }
  if (!/^[\d.,]+$/.test(body)) throw new Error('Not a number')

  if (decimals === 0) {
    const digits = body.replace(/[.,]/g, '')
    if (!/^\d+$/.test(digits)) throw new Error('Not an integer amount')
    return sign * BigInt(digits)
  }

  const lastDot = body.lastIndexOf('.')
  const lastComma = body.lastIndexOf(',')
  const lastSep = Math.max(lastDot, lastComma)
  let intStr: string
  let fracStr: string
  if (lastSep === -1) { intStr = body; fracStr = '' }
  else {
    const tailLen = body.length - lastSep - 1
    if (tailLen >= 1 && tailLen <= 2) {
      intStr = body.slice(0, lastSep).replace(/[.,]/g, '')
      fracStr = body.slice(lastSep + 1)
    } else {
      intStr = body.replace(/[.,]/g, ''); fracStr = ''
    }
  }
  const padded = (fracStr + '00').slice(0, 2)
  return sign * BigInt((intStr || '0') + padded)
}
