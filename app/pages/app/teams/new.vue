<script setup lang="ts">
import { ApiErrorThrown, useApi } from '~/composables/useApi'
import { CURRENCIES } from '~~/shared/currency'
import type { Team, TeamMember } from '~~/server/db/schema'

definePageMeta({ layout: 'app' })

const { t } = useI18n()

const form = reactive({
  name: '',
  defaultCurrency: 'VND' as (typeof CURRENCIES)[number],
  timezone: 'Asia/Ho_Chi_Minh',
})

const submitting = ref(false)
const error = ref<string | null>(null)

async function submit() {
  error.value = null
  submitting.value = true
  try {
    const res = await useApi<{ team: Team; member: TeamMember }>('/api/teams', {
      method: 'POST',
      body: form,
    })
    await navigateTo(`/app/teams/${res.team.id}`)
  } catch (e) {
    if (e instanceof ApiErrorThrown) {
      error.value = t(`errors.${e.code}` as 'errors.INTERNAL')
    } else {
      error.value = t('errors.INTERNAL')
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <section class="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-8 enter">
    <header class="space-y-3">
      <NuxtLink
        to="/app/groups"
        class="kicker hover:text-[var(--md-primary)] inline-flex items-center gap-1.5 transition-colors"
      >
        <MIcon name="arrow_back" :size="14" />
        {{ t('app.allGroups') }}
      </NuxtLink>
      <h1 class="font-headline-lg text-[var(--md-on-surface)]">{{ t('teams.newTitle') }}</h1>
    </header>

    <form
      class="rounded-2xl bg-[var(--md-surface-container-lowest)] border border-[var(--md-outline-variant)]/60
             shadow-[var(--shadow-card)] p-6 sm:p-8 space-y-5"
      @submit.prevent="submit"
    >
      <div class="space-y-2">
        <label class="font-label-md text-[var(--md-on-surface-variant)] px-1">
          {{ t('teams.fields.name') }}
        </label>
        <input
          v-model="form.name"
          type="text"
          autocomplete="off"
          autofocus
          maxlength="80"
          :placeholder="t('teams.placeholders.name')"
          class="w-full bg-[var(--md-surface-container-low)] border-none rounded-xl
                 px-4 py-4 focus:ring-2 focus:ring-[var(--md-primary-container)]
                 font-body-md text-[var(--md-on-surface)]
                 placeholder:text-[var(--md-on-surface-variant)]/60"
        />
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div class="space-y-2">
          <label class="font-label-md text-[var(--md-on-surface-variant)] px-1">
            {{ t('teams.fields.currency') }}
          </label>
          <select
            v-model="form.defaultCurrency"
            class="w-full bg-[var(--md-surface-container-low)] border-none rounded-xl
                   px-4 py-4 focus:ring-2 focus:ring-[var(--md-primary-container)]
                   font-body-md text-[var(--md-on-surface)] appearance-none"
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
            class="w-full bg-[var(--md-surface-container-low)] border-none rounded-xl
                   px-4 py-4 focus:ring-2 focus:ring-[var(--md-primary-container)]
                   font-body-md text-[var(--md-on-surface)]"
          />
        </div>
      </div>

      <div
        v-if="error"
        class="rounded-xl bg-[var(--md-error-container)]/30 border border-[var(--md-error)]/30 px-4 py-3
               text-[var(--md-error)] font-label-md flex items-center gap-2"
      >
        <MIcon name="error" :size="20" />
        {{ error }}
      </div>

      <div class="flex items-center gap-3 pt-3 border-t border-[var(--md-outline-variant)]/40">
        <BButton type="submit" size="lg" :loading="submitting" :disabled="!form.name.trim()" icon="add">
          {{ t('teams.create') }}
        </BButton>
        <BButton to="/app/groups" variant="ghost" size="lg">
          {{ t('common.cancel') }}
        </BButton>
      </div>
    </form>
  </section>
</template>
