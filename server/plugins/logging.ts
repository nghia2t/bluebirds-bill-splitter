// Lightweight request logging via Nitro hooks.  In dev this prints colourful
// one-liners; in prod we emit JSON so log shippers (Vercel's drains, Logtail,
// etc.) can ingest cleanly without grep gymnastics.
//
// `request_id` is added to the response header and the log line so a user can
// quote it back to support and the team can find the matching log entry.

import { randomUUID } from 'node:crypto'
import { getHeader, getMethod, getRequestURL, getResponseStatus, setResponseHeader } from 'h3'
import type { H3Event } from 'h3'

export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('request', (event: H3Event) => {
    const id = getHeader(event, 'x-request-id') ?? randomUUID()
    event.context.requestId = id
    event.context.startTime = Date.now()
    setResponseHeader(event, 'x-request-id', id)
  })

  nitro.hooks.hook('beforeResponse', (event: H3Event) => {
    const start = (event.context.startTime as number | undefined) ?? Date.now()
    const durationMs = Date.now() - start
    const status = getResponseStatus(event)

    const session = event.context.session as { user?: { id?: string } } | undefined
    const userId = session?.user?.id ?? null

    if (process.env.NODE_ENV === 'production') {
      console.log(JSON.stringify({
        ts: new Date().toISOString(),
        level: status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info',
        request_id: event.context.requestId,
        method: getMethod(event),
        path: getRequestURL(event).pathname,
        status,
        duration_ms: durationMs,
        user_id: userId,
      }))
    } else {
      const colour = status >= 500 ? '\x1b[31m' : status >= 400 ? '\x1b[33m' : '\x1b[32m'
      const reset = '\x1b[0m'
      console.log(
        `${colour}${status}${reset} ${getMethod(event).padEnd(6)} ${getRequestURL(event).pathname} ${durationMs}ms`,
      )
    }
  })
})
