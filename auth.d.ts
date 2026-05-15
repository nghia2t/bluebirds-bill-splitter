// Type augmentation for nuxt-auth-utils. Picked up automatically because the
// file lives at the project root with a `.d.ts` extension and `export {}` makes
// it a module without polluting the global scope.
//
// Keep the session payload minimal — re-fetch memberships per request from the
// DB rather than caching them in the cookie.

declare module '#auth-utils' {
  interface User {
    id: string             // users.id (uuid)
    email: string
    name: string
    avatarUrl: string | null
    preferredLang: 'en' | 'vi'
  }

  interface UserSession {
    user: User
    loggedInAt: number     // epoch ms; useful for "session age" checks later
  }

  // No secure-only data needed yet (private session); leave the default.
}

export {}
