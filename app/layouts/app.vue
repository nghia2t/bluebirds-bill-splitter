<script setup lang="ts">
// In-app shell — the canonical signed-in chrome.
//
//   Desktop  ────────────────────────────────────────────────────────
//   ┌─────────────┐  ┌──────────────────────────────────────────────┐
//   │  Sidebar    │  │  Top bar (search · notifications · avatar)  │
//   │  BlueBirds  │  ├──────────────────────────────────────────────┤
//   │  Dashboard* │  │                                              │
//   │  Activity   │  │  <slot /> — the routed page                  │
//   │  Groups     │  │                                              │
//   │  Settlemts. │  └──────────────────────────────────────────────┘
//   │  Settings   │
//   │ ─────────── │
//   │  + Add Exp. │     Fixed-width 16rem sidebar + 4rem top bar.
//   │  Help · Out │
//   └─────────────┘
//
//   Mobile  ─────────────────────────────────────────────────────────
//   Top bar only (slim, brand-left, icons-right).  Bottom-tab nav at
//   the page foot with a raised central FAB for "Add Expense".
//
// All five sidebar items map to real routes: /app, /app/activity,
// /app/groups, /app/settlements, /app/settings.

const { t, locale, locales, setLocale } = useI18n()
const { user, clear } = useUserSession()
const colorMode = useColorMode()
const route = useRoute()

const otherLocale = computed(() =>
  locales.value.find((l: any) => l.code !== locale.value),
)
const isDark = computed(() => colorMode.value === 'dark')
function toggleTheme() {
  colorMode.preference = isDark.value ? 'light' : 'dark'
}

async function changeLocale(code: string) {
  await setLocale(code as 'en' | 'vi')
  await reloadNuxtApp({ force: true })
}

async function signOut() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await clear()
  await navigateTo('/')
}

interface NavItem {
  key: string
  label: string
  icon: string
  to: string
  /** for active-state highlighting; if omitted, equal-match on `to` */
  match?: (path: string) => boolean
}

const nav = computed<NavItem[]>(() => [
  {
    key: 'dashboard',
    label: t('nav.dashboard'),
    icon: 'dashboard',
    to: '/app',
    match: (p) => p === '/app',
  },
  {
    key: 'activity',
    label: t('nav.activity'),
    icon: 'receipt_long',
    to: '/app/activity',
    match: (p) => p.startsWith('/app/activity'),
  },
  {
    key: 'groups',
    label: t('nav.groups'),
    icon: 'group',
    to: '/app/groups',
    match: (p) => p.startsWith('/app/groups') || p.startsWith('/app/teams'),
  },
  {
    key: 'settlements',
    label: t('nav.settlements'),
    icon: 'payments',
    to: '/app/settlements',
    match: (p) => p.startsWith('/app/settlements'),
  },
  {
    key: 'settings',
    label: t('nav.settings'),
    icon: 'settings',
    to: '/app/settings',
    match: (p) => p.startsWith('/app/settings'),
  },
])

function isActive(item: NavItem): boolean {
  return item.match ? item.match(route.path) : route.path === item.to
}

// "Add Expense" is the primary action for both the sidebar CTA and the mobile
// FAB.  When the user is inside a team we route to that team and trigger the
// new-bill dialog via a query param the page reads on mount; outside a team
// we send them to /app/groups to pick one first.
const addExpenseHref = computed(() => {
  const m = route.path.match(/^\/app\/teams\/([^/]+)/)
  if (m) return `/app/teams/${m[1]}?new=1`
  return '/app/groups'
})

// Notifications dot is a placeholder for v1 — kept in the markup so the
// design matches; wired to a real count later.
const hasNotifications = ref(true)
</script>

<template>
  <div class="min-h-screen bg-[var(--md-background)] text-[var(--md-on-background)]">
    <!-- ============ Desktop sidebar (≥md) ============ -->
    <aside
      class="hidden md:flex fixed left-0 top-0 h-screen w-64 flex-col py-6 z-40
             bg-[var(--md-surface-container-low)] border-r border-[var(--md-outline-variant)]"
    >
      <NuxtLink
        to="/app"
        class="px-6 mb-6 flex items-center gap-3 group"
        :aria-label="t('nav.brand')"
      >
        <span
          class="inline-flex size-10 items-center justify-center rounded-xl
                 bg-[var(--md-primary)] text-white shadow-[var(--shadow-card-hero)]
                 transition-transform duration-300 ease-out group-hover:-rotate-3"
        >
          <svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor"
               stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 16c4 0 7-2 9-6" />
            <path d="M8 18c5 0 9-3 12-9" />
            <path d="M14 6l3-2-1 3" />
          </svg>
        </span>
        <span class="flex flex-col leading-none">
          <span class="font-headline-md font-bold text-[var(--md-primary)] tracking-tight">
            {{ t('nav.brand') }}
          </span>
          <span class="kicker !text-[10px] mt-1">{{ t('nav.tagline') }}</span>
        </span>
      </NuxtLink>

      <nav class="flex-1 px-3 space-y-1" aria-label="Primary">
        <NuxtLink
          v-for="item in nav"
          :key="item.key"
          :to="item.to"
          class="group flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-150 ease-out"
          :class="isActive(item)
            ? 'text-[var(--md-primary)] font-semibold bg-[var(--md-primary-container)]/10 border-r-4 border-[var(--md-primary)] translate-x-1'
            : 'text-[var(--md-on-surface-variant)] hover:bg-[var(--md-surface-container-high)] hover:text-[var(--md-on-surface)]'"
        >
          <MIcon :name="item.icon" :filled="isActive(item)" :size="22" />
          <span class="font-label-md">{{ item.label }}</span>
        </NuxtLink>
      </nav>

      <div class="px-4 pt-4">
        <BButton
          :to="addExpenseHref"
          variant="filled"
          size="lg"
          icon="add"
          block
        >
          {{ t('nav.addExpense') }}
        </BButton>
      </div>

      <div class="px-4 pt-4 mt-4 border-t border-[var(--md-outline-variant)] space-y-1">
        <button
          type="button"
          class="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm
                 text-[var(--md-on-surface-variant)] hover:bg-[var(--md-surface-container-high)]
                 hover:text-[var(--md-on-surface)] transition-colors"
          @click="signOut"
        >
          <MIcon name="logout" :size="20" />
          <span class="font-label-md">{{ t('auth.signOut') }}</span>
        </button>
      </div>
    </aside>

    <!-- ============ Top bar (all viewports) ============ -->
    <header
      class="sticky top-0 z-30 h-16 bg-[var(--md-surface)]/85 backdrop-blur-xl
             supports-[backdrop-filter]:bg-[var(--md-surface)]/70
             border-b border-[var(--md-outline-variant)]
             md:ml-64"
    >
      <div class="h-full flex items-center justify-between gap-3 px-4 md:px-8">
        <!-- Mobile brand (sidebar hidden) -->
        <NuxtLink
          to="/app"
          class="md:hidden inline-flex items-center gap-2 font-headline-md font-bold text-[var(--md-primary)]"
          :aria-label="t('nav.brand')"
        >
          <span class="inline-flex size-8 items-center justify-center rounded-lg
                       bg-[var(--md-primary)] text-white shadow-[var(--shadow-card)]">
            <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor"
                 stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M3 16c4 0 7-2 9-6" />
              <path d="M8 18c5 0 9-3 12-9" />
              <path d="M14 6l3-2-1 3" />
            </svg>
          </span>
          <span class="text-lg">{{ t('nav.brand') }}</span>
        </NuxtLink>
        <span class="hidden md:block" aria-hidden="true" />

        <div class="flex items-center gap-1 sm:gap-2">
          <button
            type="button"
            class="size-10 rounded-full inline-flex items-center justify-center
                   text-[var(--md-on-surface-variant)] hover:text-[var(--md-primary)]
                   hover:bg-[var(--md-surface-container-high)] transition-colors"
            :aria-label="t('nav.search')"
          >
            <MIcon name="search" :size="22" />
          </button>
          <button
            type="button"
            class="relative size-10 rounded-full inline-flex items-center justify-center
                   text-[var(--md-on-surface-variant)] hover:text-[var(--md-primary)]
                   hover:bg-[var(--md-surface-container-high)] transition-colors"
            :aria-label="t('nav.notifications')"
          >
            <MIcon name="notifications" :size="22" />
            <span
              v-if="hasNotifications"
              class="absolute top-2 right-2 size-2 rounded-full bg-[var(--md-error)]"
              aria-hidden="true"
            />
          </button>

          <button
            v-if="otherLocale"
            type="button"
            class="px-2.5 h-9 rounded-lg text-[11px] font-semibold tracking-[0.14em] uppercase
                   text-[var(--md-on-surface-variant)] hover:text-[var(--md-on-surface)]
                   hover:bg-[var(--md-surface-container-high)] transition-colors"
            @click="changeLocale(otherLocale.code)"
          >
            {{ otherLocale.code === 'en' ? 'EN' : 'VI' }}
          </button>

          <ClientOnly>
            <button
              type="button"
              class="size-10 rounded-full inline-flex items-center justify-center
                     text-[var(--md-on-surface-variant)] hover:text-[var(--md-primary)]
                     hover:bg-[var(--md-surface-container-high)] transition-colors"
              :aria-label="isDark ? 'Switch to light theme' : 'Switch to dark theme'"
              @click="toggleTheme"
            >
              <MIcon :name="isDark ? 'light_mode' : 'dark_mode'" :size="20" />
            </button>
            <template #fallback>
              <span class="inline-block size-10" aria-hidden="true" />
            </template>
          </ClientOnly>

          <div class="hidden sm:flex items-center gap-2 pl-2 ml-1 border-l border-[var(--md-outline-variant)]">
            <BAvatar :src="user?.avatarUrl" :name="user?.name" :size="34" ring />
            <span class="text-sm font-medium text-[var(--md-on-surface)] max-w-[14ch] truncate">
              {{ user?.name }}
            </span>
          </div>
          <BAvatar
            class="sm:hidden ml-1"
            :src="user?.avatarUrl"
            :name="user?.name"
            :size="34"
          />
        </div>
      </div>
    </header>

    <!-- ============ Page slot ============ -->
    <main class="md:ml-64 pb-28 md:pb-12">
      <slot />
    </main>

    <!-- ============ Mobile bottom navigation (<md) ============ -->
    <nav
      class="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[var(--md-surface)]/95 backdrop-blur-xl
             border-t border-[var(--md-outline-variant)]
             pb-[max(env(safe-area-inset-bottom),0px)]"
      :aria-label="t('nav.dashboard')"
    >
      <div class="h-20 flex items-center justify-around relative">
        <NuxtLink
          v-for="(item, idx) in nav.slice(0, 2)"
          :key="item.key"
          :to="item.to"
          class="flex flex-col items-center gap-1 px-4 transition-colors"
          :class="isActive(item) ? 'text-[var(--md-primary)] font-semibold' : 'text-[var(--md-on-surface-variant)]'"
        >
          <MIcon :name="item.icon" :filled="isActive(item)" :size="22" />
          <span class="text-[10px] uppercase tracking-tighter">{{ item.label }}</span>
          <span v-if="idx === -1" aria-hidden />
        </NuxtLink>

        <NuxtLink
          :to="addExpenseHref"
          class="absolute left-1/2 -translate-x-1/2 -top-7 size-14 rounded-full
                 bg-[var(--md-primary)] text-white shadow-[var(--shadow-card-hero)]
                 inline-flex items-center justify-center
                 active:scale-90 transition-transform"
          :aria-label="t('nav.addExpense')"
        >
          <MIcon name="add" :size="32" />
        </NuxtLink>

        <NuxtLink
          v-for="item in nav.slice(2, 5)"
          :key="item.key"
          :to="item.to"
          class="flex flex-col items-center gap-1 px-4 transition-colors"
          :class="isActive(item) ? 'text-[var(--md-primary)] font-semibold' : 'text-[var(--md-on-surface-variant)]'"
        >
          <MIcon :name="item.icon" :filled="isActive(item)" :size="22" />
          <span class="text-[10px] uppercase tracking-tighter">{{ item.label }}</span>
        </NuxtLink>
      </div>
    </nav>

    <AppToast />
  </div>
</template>
