<script setup lang="ts">
// Team settings — name, currency, timezone, and (owner-only) deletion.

import type { Team, TeamMember } from '~~/server/db/schema'
import { ApiErrorThrown, useApi } from '~/composables/useApi'
import { CURRENCIES } from '~~/shared/currency'
import { useAppToast } from '~/composables/useAppToast'

definePageMeta({ layout: 'app' })

const route = useRoute()
const { t } = useI18n()
const { add: toast } = useAppToast()
const teamId = computed(() => route.params.teamId as string)

const { data: teamData, refresh } = await useAsyncData(
  () => `team-${teamId.value}`,
  () => useApi<{ team: Team; member: TeamMember }>(`/api/teams/${teamId.value}`),
)
const team = computed(() => teamData.value!.team)
const isOwner = computed(() => teamData.value!.member.role === 'owner')

const form = reactive({
  name: '',
  defaultCurrency: 'VND' as (typeof CURRENCIES)[number],
  timezone: 'Asia/Ho_Chi_Minh',
})

watchEffect(() => {
  if (!team.value) return
  form.name = team.value.name
  form.defaultCurrency = team.value.defaultCurrency as never
  form.timezone = team.value.timezone
})

const saving = ref(false)
async function save() {
  saving.value = true
  try {
    await useApi(`/api/teams/${teamId.value}`, { method: 'PATCH', body: form })
    await refresh()
    toast({ title: t('teams.settings.saved'), color: 'success' })
  } catch (e) {
    if (e instanceof ApiErrorThrown) {
      toast({ title: t(`errors.${e.code}` as 'errors.INTERNAL'), color: 'error' })
    } else {
      toast({ title: t('errors.INTERNAL'), color: 'error' })
    }
  } finally {
    saving.value = false
  }
}

async function deleteTeam() {
  if (!isOwner.value) return
  const phrase = team.value?.name ?? ''
  const confirmInput = prompt(t('teams.settings.deleteConfirmPrompt', { name: phrase }))
  if (confirmInput !== phrase) {
    if (confirmInput !== null) toast({ title: t('teams.settings.deleteMismatch'), color: 'warning' })
    return
  }
  try {
    await useApi(`/api/teams/${teamId.value}`, { method: 'DELETE' })
    toast({ title: t('teams.settings.deleted'), color: 'success' })
    await navigateTo('/app/groups')
  } catch {
    toast({ title: t('errors.INTERNAL'), color: 'error' })
  }
}
</script>

<template>
  <div v-if="team" class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-8 enter">
    <header class="space-y-3">
      <NuxtLink
        :to="`/app/teams/${teamId}`"
        class="kicker hover:text-[var(--md-primary)] inline-flex items-center gap-1.5 transition-colors"
      >
        <MIcon name="arrow_back" :size="14" />
        {{ team.name }}
      </NuxtLink>
      <h1 class="font-headline-lg text-[var(--md-on-surface)]">{{ t('teams.settings.title') }}</h1>
    </header>

    <TeamNav :team-id="teamId" />

    <form
      class="rounded-2xl bg-[var(--md-surface-container-lowest)] border border-[var(--md-outline-variant)]/60
             shadow-[var(--shadow-card)] p-6 sm:p-8 space-y-5"
      @submit.prevent="save"
    >
      <div class="space-y-2">
        <label class="font-label-md text-[var(--md-on-surface-variant)] px-1">
          {{ t('teams.fields.name') }}
        </label>
        <input
          v-model="form.name"
          type="text"
          maxlength="80"
          :disabled="!isOwner"
          class="w-full bg-[var(--md-surface-container-low)] border-none rounded-xl
                 px-4 py-4 focus:ring-2 focus:ring-[var(--md-primary-container)]
                 font-body-md text-[var(--md-on-surface)] disabled:opacity-60"
        />
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div class="space-y-2">
          <label class="font-label-md text-[var(--md-on-surface-variant)] px-1">
            {{ t('teams.fields.currency') }}
          </label>
          <select
            v-model="form.defaultCurrency"
            :disabled="!isOwner"
            class="w-full bg-[var(--md-surface-container-low)] border-none rounded-xl
                   px-4 py-4 focus:ring-2 focus:ring-[var(--md-primary-container)]
                   font-body-md text-[var(--md-on-surface)] disabled:opacity-60 appearance-none"
          >
            <option v-for="c in CURRENCIES" :key="c" :value="c">{{ c }}</option>
          </select>
        </div>
        <div class="space-y-2">
          <label class="font-label-md text-[var(--md-on-surface-variant)] px-1">
            {{ t('teams.fields.timezone') }}
          </label>
          <input
            v-model="form.timezone"
            type="text"
            maxlength="64"
            :disabled="!isOwner"
            class="w-full bg-[var(--md-surface-container-low)] border-none rounded-xl
                   px-4 py-4 focus:ring-2 focus:ring-[var(--md-primary-container)]
                   font-body-md text-[var(--md-on-surface)] disabled:opacity-60"
          />
        </div>
      </div>

      <div v-if="isOwner" class="flex items-center gap-3 pt-3 border-t border-[var(--md-outline-variant)]/40">
        <BButton type="submit" size="lg" :loading="saving" icon="check">
          {{ t('teams.settings.save') }}
        </BButton>
      </div>
      <p v-else class="text-sm text-[var(--md-on-surface-variant)] flex items-center gap-2">
        <MIcon name="info" :size="18" />
        {{ t('teams.settings.ownerOnly') }}
      </p>
    </form>

    <!-- Danger zone -->
    <section
      v-if="isOwner"
      class="rounded-2xl border border-[var(--md-error)]/30 bg-[var(--md-error-container)]/15 p-5 sm:p-6 space-y-3"
    >
      <p class="kicker !text-[var(--md-error)]">{{ t('teams.settings.danger') }}</p>
      <p class="font-body-md text-[var(--md-on-surface)] leading-relaxed">
        {{ t('teams.settings.deleteWarning') }}
      </p>
      <BButton variant="danger" icon="delete_forever" @click="deleteTeam">
        {{ t('teams.settings.deleteTeam') }}
      </BButton>
    </section>
  </div>
</template>
