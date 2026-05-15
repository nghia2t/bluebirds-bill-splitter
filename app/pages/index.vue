<script setup lang="ts">
const { t } = useI18n()
const { loggedIn, user } = useUserSession()
const route = useRoute()

const signInHref = computed(() => {
  const target = typeof route.query.redirect === 'string' ? route.query.redirect : '/app'
  return `/auth/google?redirect=${encodeURIComponent(target)}`
})

const showAuthError = computed(() => route.query.auth_error === '1')

const steps = ['01', '02', '03'] as const
</script>

<template>
  <section class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 sm:pt-20 pb-12 enter">
    <p class="kicker !text-[var(--md-primary)]">
      <span class="inline-flex items-center gap-2">
        <span class="size-1.5 rounded-full bg-[var(--md-primary)] inline-block" />
        {{ t('landing.eyebrow') }}
      </span>
    </p>

    <h1
      class="mt-5 font-sans font-bold text-[var(--md-on-background)]
             text-[2.5rem] leading-[1.05] tracking-[-0.025em]
             sm:text-[3.75rem] lg:text-[5rem]
             max-w-[16ch]"
    >
      {{ t('landing.title') }}
    </h1>

    <p
      class="mt-6 text-[var(--md-on-surface-variant)] text-base sm:text-lg max-w-[44ch] leading-relaxed"
    >
      {{ t('landing.subtitle') }}
    </p>

    <div
      v-if="showAuthError"
      class="mt-6 max-w-md rounded-xl bg-[var(--md-error-container)]/30 border border-[var(--md-error)]/30
             px-4 py-3 text-[var(--md-error)] font-label-md flex items-center gap-2"
    >
      <MIcon name="error" :size="20" />
      {{ t('landing.authError') }}
    </div>

    <div class="mt-9 flex flex-wrap items-center gap-4">
      <BButton
        v-if="loggedIn"
        to="/app"
        size="xl"
        trailing-icon="arrow_forward"
      >
        {{ t('landing.openApp', { name: user?.name }) }}
      </BButton>
      <BButton
        v-else
        :to="signInHref"
        size="xl"
        icon="login"
      >
        {{ t('landing.signIn') }}
      </BButton>

      <p class="text-xs text-[var(--md-on-surface-variant)] max-w-[26ch]">
        {{ t('landing.scopeNote') }}
      </p>
    </div>

    <div class="rule mt-16 sm:mt-24" aria-hidden="true" />

    <div class="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-10 sm:gap-12">
      <div v-for="n in steps" :key="n" class="space-y-3 relative">
        <div class="flex items-baseline gap-3">
          <span class="font-display-lg text-[var(--md-primary)] leading-none">{{ n }}</span>
          <span class="kicker">{{ t('landing.steps.stepLabel') }}</span>
        </div>
        <h2 class="font-headline-md text-[var(--md-on-surface)] leading-tight">
          {{ t(`landing.steps.${n}.title`) }}
        </h2>
        <p class="font-body-md text-[var(--md-on-surface-variant)] leading-relaxed max-w-[32ch]">
          {{ t(`landing.steps.${n}.copy`) }}
        </p>
      </div>
    </div>
  </section>
</template>
