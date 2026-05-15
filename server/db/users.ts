// User upserts. Kept in db/ rather than utils/ because every read/write here
// is a Drizzle call — this is the only place outside of services/ that talks
// to the DB module directly.

import { eq } from 'drizzle-orm'
import { useDb } from './client'
import { users, type User } from './schema'

export interface GoogleProfile {
  sub: string              // Google's stable user id
  email: string
  name: string
  picture?: string | null
}

/**
 * Find or create a user from a freshly verified Google OAuth profile.
 *
 * `google_sub` is the source of truth; if the email later changes on the Google
 * side, we update it (the user is the same human).  The returned row is the
 * authoritative `users` entry — use its id for sessions, never Google's sub.
 */
export async function upsertUserFromGoogle(profile: GoogleProfile): Promise<User> {
  const db = useDb()

  const existing = await db.query.users.findFirst({
    where: eq(users.googleSub, profile.sub),
  })

  if (existing) {
    // Cheap idempotent refresh — only write when something actually changed,
    // so we don't churn the row on every sign-in.
    const fresh = {
      email: profile.email,
      name: profile.name,
      avatarUrl: profile.picture ?? null,
    }
    const drift =
      existing.email !== fresh.email ||
      existing.name !== fresh.name ||
      existing.avatarUrl !== fresh.avatarUrl

    if (!drift) return existing

    const [updated] = await db
      .update(users)
      .set(fresh)
      .where(eq(users.id, existing.id))
      .returning()
    return updated!
  }

  const [created] = await db
    .insert(users)
    .values({
      googleSub: profile.sub,
      email: profile.email,
      name: profile.name,
      avatarUrl: profile.picture ?? null,
      // preferredLang stays at the schema default ('en'); the language switcher
      // updates it later.
    })
    .returning()
  return created!
}
