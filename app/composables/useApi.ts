// Thin $fetch wrapper that surfaces our stable error codes to the UI.
//
// The server returns errors as `{ error: { code, message, details? } }`.  By
// the time $fetch sees a 4xx/5xx it has already wrapped the body in
// `error.data`, so we just normalise that shape into a plain object the
// caller can pattern-match on.
//
// SSR cookie forwarding: when this composable runs during SSR (e.g. inside
// `useAsyncData(() => useApi('/api/teams'))`), the global `$fetch` does NOT
// pass the incoming request's cookies along to the internal API call.  That
// makes every auth-required endpoint 401 on the first server render, leaving
// `data` null and the page showing its empty state even though the user is
// logged in.  `useRequestFetch()` returns a `$fetch` bound to the current
// request — headers (incl. session cookie) are forwarded for us.  On the
// client the global `$fetch` already includes cookies, so we don't need it.
//
// Types: Nitro's typed-route inference on `$fetch` (and the request-bound
// fetch from `useRequestFetch()`) is deep enough that the TS comparator
// gives up ("Excessive stack depth") the moment we try to alias either of
// them.  We work around it by routing the call through an `any` cast — we
// don't need typed-route magic inside this wrapper because callers pass
// `<T>` for the response shape themselves.

import type { FetchOptions } from 'ofetch'

export interface ApiError {
  code: string
  message: string
  details?: unknown
  status: number
}

export class ApiErrorThrown extends Error {
  readonly code: string
  readonly status: number
  readonly details?: unknown

  constructor(api: ApiError) {
    super(api.message)
    this.code = api.code
    this.status = api.status
    this.details = api.details
  }
}

export async function useApi<T>(
  url: string,
  opts?: FetchOptions,
): Promise<T> {
  try {
    if (import.meta.server) {
      // Request-bound fetch: forwards the incoming request's cookies/headers
      // to internal API routes so auth-protected endpoints see the session.
      const requestFetch = useRequestFetch() as any
      return (await requestFetch(url, opts)) as T
    }
    return (await ($fetch as any)(url, opts)) as T
  } catch (raw: any) {
    const status: number = raw?.status ?? raw?.statusCode ?? 0
    const body = raw?.data
    const envelope = body?.error
    if (envelope && typeof envelope.code === 'string') {
      throw new ApiErrorThrown({
        code: envelope.code,
        message: envelope.message ?? envelope.code,
        details: envelope.details,
        status,
      })
    }
    // Non-envelope failure — network blip, 502 from a proxy, etc.
    throw new ApiErrorThrown({
      code: 'INTERNAL',
      message: raw?.message ?? 'Network error',
      status,
    })
  }
}
