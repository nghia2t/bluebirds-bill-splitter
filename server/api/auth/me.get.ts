// Lightweight session probe. Returns null when signed-out so the client can
// distinguish "no session" from "network error" without inspecting status codes.

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  return { user: session?.user ?? null }
})
