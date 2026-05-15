<script setup lang="ts">
// Top-level Settings is intentionally a thin placeholder — team-scoped
// settings live under /app/teams/[id]/settings.  We keep the route alive so
// the sidebar entry doesn't 404 and we have a home for future per-user
// preferences (language, theme, notifications).

definePageMeta({ layout: 'app' })

const { t, locale, locales, setLocale } = useI18n()
const colorMode = useColorMode()
const { user } = useUserSession()

const otherLocale = computed(() =>
  locales.value.find((l: any) => l.code !== locale.value),
)
const isDark = computed(() => colorMode.value === 'dark')

async function changeLocale(code: string) {
  await setLocale(code as 'en' | 'vi')
  await reloadNuxtApp({ force: true })
}
</script>

<template>
  <section class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-8 enter">
    <header class="space-y-1.5">
      <p class="kicker !text-[var(--md-primary)]">{{ t('nav.settings') }}</p>
      <h1 class="font-headline-lg text-[var(--md-on-surface)]">{{ t('nav.settings') }}</h1>
    </header>

    <!-- Account card -->
    <section class="rounded-2xl bg-[var(--md-surface-container-lowest)] border border-[var(--md-outline-variant)]/60 p-6 shadow-[var(--shadow-card)] space-y-5">
      <div class="flex items-center gap-4">
        <BAvatar :src="user?.avatarUrl" :name="user?.name" :size="56" ring />
        <div class="min-w-0">
          <p class="font-headline-md text-[var(--md-on-surface)] truncate">{{ user?.name }}</p>
          <p class="font-label-sm text-[var(--md-on-surface-variant)] truncate">{{ user?.email }}</p>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[var(--md-outline-variant)]/40">
        <div class="flex items-center justify-between p-3 rounded-xl bg-[var(--md-surface-container-low)]">
          <div>
            <p class="font-label-md text-[var(--md-on-surface)]">Language</p>
            <p class="font-label-sm text-[var(--md-on-surface-variant)]">{{ locale === 'en' ? 'English' : 'Tiếng Việt' }}</p>
          </div>
          <BButton
            v-if="otherLocale"
            size="sm"
            variant="tonal"
            @click="changeLocale(otherLocale.code)"
          >
            {{ otherLocale.code === 'en' ? 'EN' : 'VI' }}
          </BButton>
        </div>

        <ClientOnly>
          <div class="flex items-center justify-between p-3 rounded-xl bg-[var(--md-surface-container-low)]">
            <div>
              <p class="font-label-md text-[var(--md-on-surface)]">Theme</p>
              <p class="font-label-sm text-[var(--md-on-surface-variant)]">{{ isDark ? 'Dark' : 'Light' }}</p>
            </div>
            <BButton
              size="sm"
              variant="tonal"
              :icon="isDark ? 'light_mode' : 'dark_mode'"
              @click="colorMode.preference = isDark ? 'light' : 'dark'"
            >
              {{ isDark ? 'Light' : 'Dark' }}
            </BButton>
          </div>
          <template #fallback>
            <div class="h-16 rounded-xl bg-[var(--md-surface-container-low)] animate-pulse" />
          </template>
        </ClientOnly>
      </div>
    </section>

    <section class="rounded-2xl bg-[var(--md-surface-container-lowest)] border border-[var(--md-outline-variant)]/60 p-6 shadow-[var(--shadow-card)]">
      <p class="font-label-md text-[var(--md-on-surface-variant)] mb-3">Team settings</p>
      <p class="font-body-md text-[var(--md-on-surface)] mb-4">
        Per-team currency, timezone and member management live inside each group.
      </p>
      <BButton to="/app/groups" variant="tonal" icon="group">
        {{ t('groups.title') }}
      </BButton>
    </section>
  </section>
</template>
