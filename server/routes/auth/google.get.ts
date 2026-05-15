// One handler does double duty for Google OAuth: initiating the redirect
// (browser hits /auth/google with no `code` param) and consuming the callback
// (Google redirects back here with `code`).  This is the nuxt-auth-utils
// convention — keep the redirect URI in the Google Console set to
// `${NUXT_PUBLIC_BASE_URL}/auth/google`.
//
// Redirect-after-auth: the caller passes `?redirect=/somewhere` at init time
// (e.g. /invite/[token] sends users here so they can accept an invite after
// signing in).  Google strips that query before bouncing back, so on init we
// stash the target in a short-lived signed cookie and read it back inside
// `onSuccess`.  Without this the user would always land on /app after sign-in
// and miss the invite-accept step entirely.

import { upsertUserFromGoogle } from '../../db/users'

const REDIRECT_COOKIE = 'auth_redirect'
const REDIRECT_TTL_SECONDS = 60 * 10 // 10 min — long enough for the Google round-trip

const oauthHandler = defineOAuthGoogleEventHandler({
  config: {
    scope: ['openid', 'email', 'profile'],
  },

  async onSuccess(event, { user: googleUser }) {
    const profile = {
      sub: String(googleUser.sub),
      email: String(googleUser.email),
      name: String(googleUser.name ?? googleUser.email),
      picture: googleUser.picture ? String(googleUser.picture) : null,
    }
    const u = await upsertUserFromGoogle(profile)

    await setUserSession(event, {
      user: {
        id: u.id,
        email: u.email,
        name: u.name,
        avatarUrl: u.avatarUrl,
        preferredLang: (u.preferredLang === 'vi' ? 'vi' : 'en'),
      },
      loggedInAt: Date.now(),
    })

    // Stashed cookie wins; fall back to query (covers the unlikely case the
    // cookie was lost mid-flight, e.g. cross-origin SameSite quirks).  Clear
    // the cookie either way so a stale value can't hijack a later sign-in.
    const stashed = getCookie(event, REDIRECT_COOKIE)
    deleteCookie(event, REDIRECT_COOKIE, { path: '/' })
    const redirect = safeRedirectTarget(stashed ?? getQuery(event).redirect)
    await sendRedirect(event, redirect, 302)
  },

  // Keep failures verbose in the console, generic on the wire.
  async onError(event, error) {
    console.error('[oauth/google] failure:', error)
    deleteCookie(event, REDIRECT_COOKIE, { path: '/' })
    await sendRedirect(event, '/?auth_error=1', 302)
  },
})

export default defineEventHandler(async (event) => {
  // Two-phase handler:
  //   - init      (no `code` query): stash `redirect=...` in a cookie before
  //                handing off to the OAuth helper, which will redirect the
  //                browser to Google.
  //   - callback  (`code` query present): the OAuth helper verifies the code
  //                and invokes onSuccess above, which reads the cookie.
  const query = getQuery(event)
  const hasCode = typeof query.code === 'string' && query.code.length > 0
  if (!hasCode) {
    const target = safeRedirectTarget(query.redirect)
    // Don't persist the default target — saves a cookie round-trip on the
    // common landing-page sign-in path.
    if (target !== '/app') {
      setCookie(event, REDIRECT_COOKIE, target, {
        maxAge: REDIRECT_TTL_SECONDS,
        sameSite: 'lax',
        httpOnly: true,
        secure: !import.meta.dev,
        path: '/',
      })
    }
  }
  return oauthHandler(event)
})

/**
 * Open redirect protection: only allow same-origin paths starting with `/`,
 * and reject `//`, `/\\` and full URLs.
 */
function safeRedirectTarget(value: unknown): string {
  if (typeof value !== 'string') return '/app'
  if (!value.startsWith('/')) return '/app'
  if (value.startsWith('//') || value.startsWith('/\\')) return '/app'
  return value
}
