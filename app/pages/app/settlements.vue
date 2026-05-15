<script setup lang="ts">
// Settlements — cross-team "settle up" workspace.
//
// Layout mirrors settle-up-and-history.html:
//   - Header w/ your net balance summary card.
//   - Suggested grid (2-col on lg) listing every suggested transfer that
//     involves the user, plus a hero "Settlement progress" bento tile.
//   - History column (4-col on lg): the user's most recent recorded payments.

import type { UserOverview, OverviewSuggestedTransfer } from '~~/server/services/user-overview'
import { ApiErrorThrown, useApi } from '~/composables/useApi'
import { useMoney } from '~/composables/useMoney'
import { useAppToast } from '~/composables/useAppToast'
import { isCurrency } from '~~/shared/currency'

definePageMeta({ layout: 'app' })

const { t } = useI18n()
const { add: toast } = useAppToast()

const { data, pending, refresh } = await useAsyncData('me-overview-settle', () =>
  useApi<UserOverview>('/api/me/overview?activityLimit=200'),
)
const overview = computed(() => data.value)

const primaryCurrency = computed(() => overview.value?.primaryCurrency ?? 'VND')
const primaryBalance = computed(() => {
  const c = primaryCurrency.value
  return overview.value?.balances.find((b) => b.currency === c)
    ?? { currency: c, net: '0', owed: '0', owes: '0' }
})
function fmt(currency: string, amount: string, style: 'compact' | 'verbose' = 'verbose'): string {
  return isCurrency(currency) ? useMoney({ currency }).format(amount, style) : amount
}
function shortDate(d: string): string {
  return new Date(d + 'T12:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

// Only show suggestions the user is part of.  Settlements between other
// people remain visible on the per-team page; surfacing them here is noise.
const youSuggested = computed<OverviewSuggestedTransfer[]>(() =>
  (overview.value?.suggested ?? []).filter((s) => s.direction !== 'other'),
)

const totalOwes = computed(() => BigInt(primaryBalance.value.owes))
const totalOwed = computed(() => BigInt(primaryBalance.value.owed))
const denom = computed(() => totalOwes.value + totalOwed.value)
const progressPct = computed(() => {
  if (denom.value === 0n) return 100
  // "How much have we already cleared" — proxy: 1 - remainingDebt / (debt+credit)
  const remaining = totalOwes.value
  const cleared = denom.value - remaining
  return Math.max(0, Math.min(100, Number((cleared * 100n) / denom.value)))
})

const submitting = ref<string | null>(null)

async function settleOne(s: OverviewSuggestedTransfer) {
  // Mark a one-tap settle for *you-pay* and *you-receive* directions.  The
  // current ledger schema treats this as recording the transfer right now,
  // which immediately zeros the two members' running balance.
  const key = `${s.teamId}:${s.fromMember.id}:${s.toMember.id}`
  submitting.value = key
  try {
    await useApi(`/api/teams/${s.teamId}/settlements`, {
      method: 'POST',
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      body: {
        fromMemberId: s.fromMember.id,
        toMemberId: s.toMember.id,
        amount: s.amount,
        settledOn: new Date().toISOString().slice(0, 10),
      },
    })
    toast({ title: t('settlements.recordedToast'), color: 'success' })
    await refresh()
  } catch (e) {
    toast({
      title: e instanceof ApiErrorThrown ? t(`errors.${e.code}` as 'errors.INTERNAL') : t('errors.INTERNAL'),
      color: 'error',
    })
  } finally {
    submitting.value = null
  }
}

async function undoSettlement(settlementId: string) {
  if (!confirm(t('settlements.confirmDelete'))) return
  try {
    await useApi(`/api/settlements/${settlementId}`, { method: 'DELETE' })
    toast({ title: t('settlements.deletedToast'), color: 'success' })
    await refresh()
  } catch (e) {
    toast({
      title: e instanceof ApiErrorThrown ? t(`errors.${e.code}` as 'errors.INTERNAL') : t('errors.INTERNAL'),
      color: 'error',
    })
  }
}
</script>

<template>
  <section class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-8 enter">
    <!-- ============ Header ============ -->
    <header class="flex flex-col md:flex-row md:items-end justify-between gap-6 flex-wrap">
      <div class="space-y-2 min-w-0">
        <p class="kicker !text-[var(--md-primary)]">{{ t('settlementsPage.eyebrow') }}</p>
        <h1 class="font-headline-lg text-[var(--md-on-surface)]">{{ t('settlementsPage.title') }}</h1>
        <p class="font-body-md text-[var(--md-on-surface-variant)] max-w-xl">
          {{ t('settlementsPage.subhead') }}
        </p>
      </div>
      <div
        class="flex items-center gap-4 p-4 rounded-2xl border border-[var(--md-primary-container)]/30
               bg-[var(--md-primary-container)]/10"
      >
        <div class="size-12 rounded-full bg-[var(--md-primary-container)] inline-flex items-center justify-center text-white shrink-0">
          <MIcon name="account_balance_wallet" :size="22" />
        </div>
        <div>
          <p class="font-label-sm text-[var(--md-on-surface-variant)] uppercase">{{ t('settlementsPage.yourNetBalance') }}</p>
          <p class="font-headline-md amount text-[var(--md-primary)]">
            {{ fmt(primaryBalance.currency, primaryBalance.net) }}
          </p>
        </div>
      </div>
    </header>

    <!-- ============ Suggested + History ============ -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <!-- Suggested (8 cols) -->
      <section class="lg:col-span-8 space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="font-headline-md text-[var(--md-on-surface)]">
            {{ t('settlementsPage.suggested') }}
          </h2>
          <span
            class="bg-[var(--md-tertiary)]/10 text-[var(--md-tertiary)] px-3 py-1 rounded-full font-label-sm"
          >
            {{ t('settlementsPage.pending', { n: youSuggested.length }) }}
          </span>
        </div>

        <div v-if="pending && !overview" class="grid sm:grid-cols-2 gap-4">
          <div v-for="n in 4" :key="n" class="h-40 rounded-2xl bg-[var(--md-surface-container-low)] animate-pulse" />
        </div>

        <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div
            v-for="s in youSuggested"
            :key="`${s.teamId}:${s.fromMember.id}:${s.toMember.id}`"
            class="rounded-2xl p-5 sm:p-6 bg-[var(--md-surface-container-lowest)]
                   border border-[var(--md-outline-variant)]/60 shadow-[var(--shadow-card)]
                   flex flex-col gap-5"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="flex items-center gap-3 min-w-0">
                <BAvatar
                  :name="s.direction === 'pay' ? s.toMember.displayName : s.fromMember.displayName"
                  :size="40"
                />
                <div class="min-w-0">
                  <p class="font-label-md text-[var(--md-on-surface)] truncate">
                    <template v-if="s.direction === 'pay'">
                      {{ t('settlementsPage.youPay', { name: s.toMember.displayName }) }}
                    </template>
                    <template v-else>
                      {{ t('settlementsPage.namePaysYou', { name: s.fromMember.displayName }) }}
                    </template>
                  </p>
                  <p class="font-label-sm text-[var(--md-on-surface-variant)] truncate">
                    {{ s.teamName }}
                  </p>
                </div>
              </div>
              <span
                class="font-headline-md amount font-bold shrink-0"
                :class="s.direction === 'pay' ? 'text-[var(--md-error)]' : 'text-[var(--md-tertiary)]'"
              >
                <template v-if="s.direction === 'pay'">-</template><template v-else>+</template>{{ fmt(s.currency, s.amount, 'compact') }}
              </span>
            </div>

            <p v-if="s.paymentInfo" class="font-mono text-xs text-[var(--md-on-surface-variant)] whitespace-pre-line">
              {{ s.paymentInfo }}
            </p>

            <div class="mt-auto space-y-3">
              <BButton
                size="lg"
                block
                icon="check"
                :loading="submitting === `${s.teamId}:${s.fromMember.id}:${s.toMember.id}`"
                @click="settleOne(s)"
              >
                {{ t('settlements.record') }}
              </BButton>
              <NuxtLink
                :to="`/app/teams/${s.teamId}`"
                class="block text-center text-xs font-label-md text-[var(--md-on-surface-variant)] hover:text-[var(--md-primary)]"
              >
                {{ t('common.viewAll') }} →
              </NuxtLink>
            </div>
          </div>

          <!-- Progress bento tile spans both columns -->
          <div
            class="sm:col-span-2 relative overflow-hidden rounded-3xl p-6 sm:p-8
                   bg-gradient-to-br from-[var(--md-primary)] to-[var(--md-secondary)] text-white"
          >
            <div class="absolute -right-10 -bottom-10 size-48 bg-white/10 rounded-full blur-3xl" aria-hidden="true" />
            <div class="relative z-10 space-y-6">
              <div class="space-y-1">
                <h3 class="font-headline-md">{{ t('settlementsPage.progressTitle') }}</h3>
                <p class="font-body-md text-white/85">
                  {{ t('settlementsPage.progressCopy', { pct: progressPct }) }}
                </p>
              </div>
              <div class="space-y-2">
                <div class="w-full bg-white/20 h-3 rounded-full overflow-hidden">
                  <div class="bg-white h-full rounded-full transition-all" :style="{ width: progressPct + '%' }" />
                </div>
                <div class="flex justify-between font-label-sm text-white/90">
                  <span>{{ t('settlementsPage.settled', { amount: fmt(primaryBalance.currency, primaryBalance.owed, 'compact') }) }}</span>
                  <span>{{ t('settlementsPage.remaining', { amount: fmt(primaryBalance.currency, primaryBalance.owes, 'compact') }) }}</span>
                </div>
              </div>
            </div>
          </div>

          <div
            v-if="!youSuggested.length && !pending"
            class="sm:col-span-2 rounded-2xl border-2 border-dashed border-[var(--md-outline-variant)]
                   bg-[var(--md-surface-container-lowest)] p-10 text-center space-y-3"
          >
            <span class="inline-flex size-12 rounded-full bg-[var(--md-tertiary)]/10 text-[var(--md-tertiary)] items-center justify-center mx-auto">
              <MIcon name="check_circle" :size="22" />
            </span>
            <p class="font-body-md text-[var(--md-on-surface-variant)]">
              {{ t('settlementsPage.noSuggested') }}
            </p>
          </div>
        </div>
      </section>

      <!-- History (4 cols) -->
      <section class="lg:col-span-4 space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="font-headline-md text-[var(--md-on-surface)]">{{ t('settlementsPage.history') }}</h2>
          <NuxtLink to="/app/activity" class="text-sm font-label-md text-[var(--md-primary)] hover:underline">
            {{ t('common.viewAll') }}
          </NuxtLink>
        </div>

        <div
          class="rounded-3xl bg-[var(--md-surface-container-lowest)] border border-[var(--md-outline-variant)]/60
                 shadow-[var(--shadow-card)] divide-y divide-[var(--md-outline-variant)]/30 overflow-hidden"
        >
          <p
            v-if="!overview?.history?.length"
            class="px-6 py-10 text-center text-sm text-[var(--md-on-surface-variant)]"
          >
            {{ t('settlementsPage.noHistory') }}
          </p>
          <div
            v-for="item in overview?.history ?? []"
            :key="`${item.kind}-${item.id}`"
            class="p-5 flex items-center justify-between gap-3"
          >
            <div class="flex items-center gap-3 min-w-0">
              <span class="size-10 rounded-xl bg-[var(--md-tertiary)]/10 text-[var(--md-tertiary)] inline-flex items-center justify-center shrink-0">
                <MIcon name="check_circle" :size="20" />
              </span>
              <div class="min-w-0">
                <p class="font-label-md text-[var(--md-on-surface)] truncate">
                  <template v-if="item.direction === 'negative'">
                    {{ t('settlementsPage.paid', { name: item.counterparty?.displayName ?? '—' }) }}
                  </template>
                  <template v-else>
                    {{ t('settlementsPage.received', { name: item.actor.displayName }) }}
                  </template>
                </p>
                <p class="font-label-sm text-[var(--md-on-surface-variant)] truncate">
                  {{ shortDate(item.date) }}
                  <span class="mx-1 text-[var(--md-outline)]">·</span>
                  {{ item.teamName }}
                </p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <span class="font-label-md amount text-[var(--md-on-surface)]">
                {{ fmt(item.currency, item.amount, 'compact') }}
              </span>
              <button
                type="button"
                class="size-8 rounded-full inline-flex items-center justify-center
                       text-[var(--md-on-surface-variant)] hover:text-[var(--md-error)]
                       hover:bg-[var(--md-error-container)]/30 transition-colors"
                :aria-label="t('settlements.undo')"
                @click="undoSettlement(item.id)"
              >
                <MIcon name="undo" :size="18" />
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  </section>
</template>
