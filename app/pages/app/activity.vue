<script setup lang="ts">
// Activity — every bill and recorded payment, across every group, newest first.
//
// We reuse /api/me/overview with `activityLimit=200`.  The page is a single
// scrolling list; filters narrow client-side without another round trip.

import type { UserOverview } from '~~/server/services/user-overview'
import { useApi } from '~/composables/useApi'
import { useMoney } from '~/composables/useMoney'
import { isCurrency } from '~~/shared/currency'

definePageMeta({ layout: 'app' })

const { t } = useI18n()

const { data, pending } = await useAsyncData('me-overview-activity', () =>
  useApi<UserOverview>('/api/me/overview?activityLimit=200'),
)
const overview = computed(() => data.value)

type Filter = 'all' | 'bill' | 'settlement'
const filter = ref<Filter>('all')

const filtered = computed(() => {
  const all = overview.value?.activity ?? []
  if (filter.value === 'all') return all
  return all.filter((a) => a.kind === filter.value)
})

function fmt(currency: string, amount: string, style: 'compact' | 'verbose' = 'verbose'): string {
  return isCurrency(currency) ? useMoney({ currency }).format(amount, style) : amount
}
function shortDate(d: string): string {
  return new Date(d + 'T12:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const activityIcon: Record<string, string> = {
  bill: 'receipt_long',
  settlement: 'payments',
}
</script>

<template>
  <section class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-8 enter">
    <header class="space-y-2">
      <p class="kicker !text-[var(--md-primary)]">{{ t('nav.activity') }}</p>
      <h1 class="font-headline-lg text-[var(--md-on-surface)]">{{ t('activity.title') }}</h1>
      <p class="font-body-md text-[var(--md-on-surface-variant)] max-w-prose">
        {{ t('activity.subhead') }}
      </p>
    </header>

    <div class="seg-rail">
      <button
        type="button"
        class="seg-tab"
        :class="{ 'seg-tab-active': filter === 'all' }"
        @click="filter = 'all'"
      >
        {{ t('activity.filterAll') }}
      </button>
      <button
        type="button"
        class="seg-tab"
        :class="{ 'seg-tab-active': filter === 'bill' }"
        @click="filter = 'bill'"
      >
        <MIcon name="receipt_long" :size="16" />
        {{ t('activity.filterBills') }}
      </button>
      <button
        type="button"
        class="seg-tab"
        :class="{ 'seg-tab-active': filter === 'settlement' }"
        @click="filter = 'settlement'"
      >
        <MIcon name="payments" :size="16" />
        {{ t('activity.filterSettlements') }}
      </button>
    </div>

    <div v-if="pending && !overview" class="space-y-2">
      <div v-for="n in 6" :key="n" class="h-16 rounded-2xl bg-[var(--md-surface-container-low)] animate-pulse" />
    </div>

    <div
      v-else-if="filtered.length"
      class="rounded-3xl bg-[var(--md-surface-container-lowest)] border border-[var(--md-outline-variant)]/60
             shadow-[var(--shadow-card)] divide-y divide-[var(--md-outline-variant)]/30 overflow-hidden"
    >
      <NuxtLink
        v-for="item in filtered"
        :key="`${item.kind}-${item.id}`"
        :to="`/app/teams/${item.teamId}`"
        class="flex items-center gap-4 px-5 py-4 hover:bg-[var(--md-surface-container-low)] transition-colors"
      >
        <span
          class="size-11 rounded-full inline-flex items-center justify-center shrink-0"
          :class="item.direction === 'positive'
            ? 'bg-[var(--md-tertiary-container)]/15 text-[var(--md-tertiary)]'
            : item.direction === 'negative'
              ? 'bg-[var(--md-error-container)]/30 text-[var(--md-error)]'
              : 'bg-[var(--md-surface-container)] text-[var(--md-on-surface-variant)]'"
        >
          <MIcon :name="activityIcon[item.kind] ?? 'receipt_long'" :size="22" />
        </span>
        <div class="flex-1 min-w-0">
          <p class="font-label-md text-[var(--md-on-surface)] truncate">
            <span class="font-bold">{{ item.actor.isYou ? 'You' : item.actor.displayName }}</span>
            <template v-if="item.kind === 'bill'">
              added "{{ item.title }}"
            </template>
            <template v-else>
              {{ item.title }}
            </template>
          </p>
          <p class="font-label-sm text-[var(--md-on-surface-variant)] truncate">
            {{ shortDate(item.date) }}
            <span class="mx-1 text-[var(--md-outline)]">·</span>
            {{ item.teamName }}
          </p>
        </div>
        <p
          class="font-label-md amount shrink-0"
          :class="item.direction === 'positive'
            ? 'text-[var(--md-tertiary)]'
            : item.direction === 'negative'
              ? 'text-[var(--md-error)]'
              : 'text-[var(--md-on-surface)]'"
        >
          <template v-if="item.direction === 'positive'">+</template><template
          v-else-if="item.direction === 'negative'">-</template>{{ fmt(item.currency, item.amount, 'compact') }}
        </p>
      </NuxtLink>
    </div>

    <div
      v-else
      class="rounded-2xl border-2 border-dashed border-[var(--md-outline-variant)]
             bg-[var(--md-surface-container-lowest)] p-10 sm:p-16 text-center space-y-3"
    >
      <span class="inline-flex size-12 rounded-full bg-[var(--md-surface-container)]
                   items-center justify-center text-[var(--md-on-surface-variant)] mx-auto">
        <MIcon name="receipt_long" :size="22" />
      </span>
      <p class="font-body-md text-[var(--md-on-surface-variant)]">{{ t('activity.empty') }}</p>
    </div>
  </section>
</template>
