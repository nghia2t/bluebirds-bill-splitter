<script setup lang="ts">
// Default layout = signed-out / marketing chrome.  A slim sticky top bar with
// the brand mark, language / theme toggles and a sign-in (or open-app) CTA.
// No sidebar, no bottom-nav — every signed-in /app/* route uses `app` layout.

const { t, locale, locales, setLocale } = useI18n()
const { loggedIn, user } = useUserSession()
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

const signInHref = computed(() => {
  const target = typeof route.query.redirect === 'string' ? route.query.redirect : '/app'
  return `/auth/google?redirect=${encodeURIComponent(target)}`
})
</script>

<template>
  <div class="min-h-screen flex flex-col text-[var(--md-on-background)]">
    <header
      class="sticky top-0 z-40 border-b border-[var(--md-outline-variant)]
             bg-[var(--md-surface)]/72 backdrop-blur-xl supports-[backdrop-filter]:bg-[var(--md-surface)]/60"
    >
      <div class="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        <NuxtLink
          :to="loggedIn ? '/app' : '/'"
          class="group inline-flex items-center gap-3"
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
            <span class="font-headline-md font-bold text-[var(--md-primary)] tracking-tight text-[1.15rem]">
              {{ t('nav.brand') }}
            </span>
            <span class="kicker !text-[10px] !tracking-[0.18em] mt-1">{{ t('nav.tagline') }}</span>
          </span>
        </NuxtLink>

        <div class="flex items-center gap-1">
          <button
            v-if="otherLocale"
            type="button"
            class="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold tracking-[0.14em] uppercase
                   text-[var(--md-on-surface-variant)] hover:text-[var(--md-on-surface)]
                   hover:bg-[var(--md-surface-container-high)] transition-colors"
            @click="changeLocale(otherLocale.code)"
          >
            {{ otherLocale.code === 'en' ? 'EN' : 'VI' }}
          </button>

          <ClientOnly>
            <button
              type="button"
              class="size-9 rounded-lg inline-flex items-center justify-center
                     text-[var(--md-on-surface-variant)] hover:text-[var(--md-primary)]
                     hover:bg-[var(--md-surface-container-high)] transition-colors"
              :aria-label="isDark ? 'Switch to light theme' : 'Switch to dark theme'"
              @click="toggleTheme"
            >
              <MIcon :name="isDark ? 'light_mode' : 'dark_mode'" :size="20" />
            </button>
            <template #fallback>
              <span class="inline-block size-9" aria-hidden="true" />
            </template>
          </ClientOnly>

          <BButton
            v-if="loggedIn"
            to="/app"
            size="sm"
            variant="filled"
            trailing-icon="arrow_forward"
            class="ml-1"
          >
            {{ t('landing.openApp', { name: user?.name }) }}
          </BButton>
          <BButton
            v-else
            :href="signInHref"
            size="sm"
            variant="filled"
            icon="login"
            class="ml-1"
          >
            {{ t('landing.signIn') }}
          </BButton>
        </div>
      </div>
    </header>

    <main class="flex-1">
      <slot />
    </main>

    <footer class="border-t border-[var(--md-outline-variant)] mt-12">
      <div
        class="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 flex flex-col sm:flex-row
               items-start sm:items-center justify-between gap-3 text-[var(--md-on-surface-variant)]"
      >
        <p class="text-sm">{{ t('footer.tagline') }}</p>
        <p class="kicker">{{ t('nav.brand') }} · {{ new Date().getFullYear() }}</p>
      </div>
    </footer>

    <AppToast />
  </div>
</template>
