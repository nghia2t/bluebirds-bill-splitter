// Clears the encrypted session cookie. Body-less POST so it can't be triggered
// by an <img src="..."> CSRF — nuxt-auth-utils sets SameSite=Lax which already
// blocks cross-site GET, and our cookie-encryption secret prevents tampering.

export default defineEventHandler(async (event) => {
  await clearUserSession(event)
  return { ok: true }
})
