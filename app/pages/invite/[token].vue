<script setup lang="ts">
// Public landing for an invite link.  We don't pre-validate the token here
// (no public read endpoint for invites by design); the user clicks "Accept"
// and we either join them or surface the error.

import { ApiErrorThrown, useApi } from '~/composables/useApi'

const route = useRoute()
const { t } = useI18n()
const { loggedIn } = useUserSession()
const token = computed(() => route.params.token as string)

const submitting = ref(false)
const errorMessage = ref<string | null>(null)

const signInHref = computed(() =>
  `/auth/google?redirect=${encodeURIComponent(`/invite/${token.value}`)}`,
)

async function accept() {
  errorMessage.value = null
  submitting.value = true
  try {
    const res = await useApi<{ teamId: string }>(
      `/api/invites/${token.value}/accept`,
      { method: 'POST' },
    )
    await navigateTo(`/app/teams/${res.teamId}`)
  } catch (e) {
    if (e instanceof ApiErrorThrown) {
      errorMessage.value = t(`errors.${e.code}` as 'errors.INTERNAL')
      if (e.code === 'ALREADY_MEMBER') {
        await navigateTo('/app')
        return
      }
    } else {
      errorMessage.value = t('errors.INTERNAL')
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <section class="max-w-md mx-auto px-4 sm:px-6 py-16 sm:py-24 enter">
    <div class="text-center space-y-6">
      <p class="kicker !text-[var(--md-primary)]">
        <span class="inline-flex items-center gap-2 justify-center">
          <span class="size-1.5 rounded-full bg-[var(--md-primary)] inline-block" />
          invitation
        </span>
      </p>

      <h1 class="font-headline-lg text-[var(--md-on-surface)] leading-tight">
        {{ t('invite.title') }}
      </h1>

      <p class="font-body-md text-[var(--md-on-surface-variant)] leading-relaxed">
        {{ t('invite.subtitle') }}
      </p>

      <div
        v-if="errorMessage"
        class="rounded-xl bg-[var(--md-error-container)]/30 border border-[var(--md-error)]/30
               px-4 py-3 text-[var(--md-error)] font-label-md flex items-center gap-2 text-left"
      >
        <MIcon name="error" :size="20" />
        {{ errorMessage }}
      </div>

      <div class="pt-2">
        <BButton
          v-if="!loggedIn"
          :href="signInHref"
          size="lg"
          icon="login"
        >
          {{ t('invite.signInToAccept') }}
        </BButton>
        <BButton
          v-else
          size="lg"
          trailing-icon="arrow_forward"
          :loading="submitting"
          @click="accept"
        >
          {{ t('invite.accept') }}
        </BButton>
      </div>
    </div>
  </section>
</template>
