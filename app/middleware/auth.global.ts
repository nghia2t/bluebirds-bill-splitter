// Client-side route guard.  Server-side `requireUser` / `requireTeamAccess`
// remain authoritative for data — this just avoids the user landing on a blank
// page that 401s after fetch.

export default defineNuxtRouteMiddleware((to) => {
  // Only protect the in-app area; the landing page and the OAuth handler stay public.
  if (!to.path.startsWith('/app')) return

  const { loggedIn } = useUserSession()
  if (loggedIn.value) return

  // Preserve the intended destination across sign-in.
  const redirect = encodeURIComponent(to.fullPath)
  return navigateTo(`/?redirect=${redirect}`, { replace: true })
})
