// Date utilities bound to a team timezone.  We deliberately avoid moment/dayjs
// here — Intl handles tz formatting natively in modern Node + every browser
// we target, and the calls we make are cheap enough that an extra layer would
// just be a tax.

export function useDates(timezone: string) {
  const ymdFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
  })

  /** "Today" in the team timezone, as YYYY-MM-DD (matches our `date` columns). */
  function todayYmd(): string {
    return ymdFmt.format(new Date())
  }

  /** Shorter, locale-agnostic display: "13 May" or "13/05" depending on caller pref. */
  function shortDate(value: string | Date, locale = 'en-GB'): string {
    const d = typeof value === 'string' ? new Date(value + 'T12:00:00Z') : value
    return new Intl.DateTimeFormat(locale, {
      day: '2-digit', month: 'short', timeZone: timezone,
    }).format(d)
  }

  function longDateTime(value: string | Date, locale = 'en-GB'): string {
    const d = typeof value === 'string' ? new Date(value) : value
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium', timeStyle: 'short', timeZone: timezone,
    }).format(d)
  }

  return { todayYmd, shortDate, longDateTime, timezone }
}
