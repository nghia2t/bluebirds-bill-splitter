// Currency metadata shared between client (display) and server (parse + format).
// All amounts in storage and on the wire are bigint integer minor units.

export const CURRENCIES = ['VND', 'USD', 'EUR', 'JPY', 'KRW', 'THB', 'SGD'] as const
export type Currency = typeof CURRENCIES[number]

export interface CurrencyMeta {
  code: Currency
  decimals: 0 | 2
  symbol: string
  thousandsSep: string
  decimalSep: string
}

export const CURRENCY_META: Record<Currency, CurrencyMeta> = {
  VND: { code: 'VND', decimals: 0, symbol: 'VND', thousandsSep: '.', decimalSep: ',' },
  USD: { code: 'USD', decimals: 2, symbol: '$', thousandsSep: ',', decimalSep: '.' },
  EUR: { code: 'EUR', decimals: 2, symbol: '€', thousandsSep: '.', decimalSep: ',' },
  JPY: { code: 'JPY', decimals: 0, symbol: '¥', thousandsSep: ',', decimalSep: '.' },
  KRW: { code: 'KRW', decimals: 0, symbol: '₩', thousandsSep: ',', decimalSep: '.' },
  THB: { code: 'THB', decimals: 2, symbol: '฿', thousandsSep: ',', decimalSep: '.' },
  SGD: { code: 'SGD', decimals: 2, symbol: 'S$', thousandsSep: ',', decimalSep: '.' },
}

export function isCurrency(value: unknown): value is Currency {
  return typeof value === 'string' && (CURRENCIES as readonly string[]).includes(value)
}
