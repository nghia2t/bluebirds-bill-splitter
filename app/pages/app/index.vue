<script setup lang="ts">
// Dashboard — the signed-in landing.
//
// Sections (matches docs/screen/bluebirds-dashboard.html):
//   1. Greeting + subhead.
//   2. Bento hero: solid Total Net Balance card (8 col) +
//      Settle-Up quick action card (4 col).
//      Inside the hero: a 2-up grid of "You are owed" / "You owe".
//   3. Active Groups list (7 col) + Recent Activity (5 col).
//
// All amounts come from /api/me/overview which aggregates across every team
// the user belongs to.  When a user has multiple currencies we pick the
// primary one (the currency with the most bills) for the headline figures
// and surface the remaining breakdown beneath.

import type { UserOverview } from '~~/server/services/user-overview'
import { useApi } from '~/composables/useApi'
import { useMoney } from '~/composables/useMoney'
import { isCurrency } from '~~/shared/currency'

definePageMeta({ layout: 'app' })

const { user } = useUserSession()
const { t } = useI18n()

const { data, pending } = await useAsyncData('me-overview', () =>
  useApi<UserOverview>('/api/me/overview?activityLimit=8'),
)
const overview = computed(() => data.value)

const firstName = computed(() => (user.value?.name ?? '').split(' ')[0] ?? '')

// Time-of-day greeting.  Local clock — good enough for a salutation.
const greeting = computed(() => {
  if (!import.meta.client) return t('dashboard.greetingMorning', { name: firstName.value })
  const h = new Date().getHours()
  const key = h < 12 ? 'greetingMorning' : h < 18 ? 'greetingAfternoon' : 'greetingEvening'
  return t(`dashboard.${key}` as 'dashboard.greetingMorning', { name: firstName.value })
})

// Primary balance — pick the currency the user spends in most.  Fall back to
// VND when there's nothing yet (matches the first-team default).
const primaryCurrency = computed(() => overview.value?.primaryCurrency ?? 'VND')
const primaryMoney = computed(() => {
  const c = primaryCurrency.value
  return isCurrency(c) ? useMoney({ currency: c }) : null
})
const primaryBalance = computed(() => {
  const b = overview.value?.balances.find((x) => x.currency === primaryCurrency.value)
  return b ?? { currency: primaryCurrency.value, net: '0', owed: '0', owes: '0' }
})

const otherBalances = computed(() =>
  overview.value?.balances.filter((b) => b.currency !== primaryCurrency.value) ?? [],
)

const suggestedCount = computed(() => {
  const all = overview.value?.suggested ?? []
  return all.filter((s) => s.direction !== 'other').length
})
const youSuggested = computed(() =>
  (overview.value?.suggested ?? []).filter((s) => s.direction !== 'other'),
)

// Avatar stack on the Settle-Up card = unique counterparties involved.
const settleAvatars = computed(() => {
  const seen = new Set<string>()
  const out: Array<{ name: string }> = []
  for (const s of youSuggested.value) {
    const other = s.direction === 'pay' ? s.toMember : s.fromMember
    if (seen.has(other.id)) continue
    seen.add(other.id)
    out.push({ name: other.displayName })
    if (out.length === 4) break
  }
  return out
})

// --- helpers per row ------------------------------------------------------

function moneyFor(currency: string) {
  return isCurrency(currency) ? useMoney({ currency }) : null
}
function fmt(currency: string, amount: string, style: 'compact' | 'verbose' = 'verbose'): string {
  return moneyFor(currency)?.format(amount, style) ?? amount
}
function timeAgo(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d
  const diffMs = Date.now() - date.getTime()
  const m = Math.round(diffMs / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.round(h / 24)
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// Group icons — a deterministic glyph per team based on the name hash so the
// list reads as distinct.
const groupIcons = ['home', 'group', 'auto_awesome', 'restaurant', 'flight', 'beach_access', 'celebration', 'directions_car', 'coffee', 'apartment'] as const
function iconForTeam(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return groupIcons[h % groupIcons.length]!
}
function tintForTeam(id: string): string {
  const tints = [
    'bg-[var(--md-primary-fixed)] text-[var(--md-primary)]',
    'bg-[var(--md-secondary-fixed)] text-[var(--md-secondary)]',
    'bg-[var(--md-tertiary-fixed)] text-[var(--md-tertiary)]',
    'bg-[var(--md-primary-container)]/15 text-[var(--md-primary)]',
  ]
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 17 + id.charCodeAt(i)) >>> 0
  return tints[h % tints.length]!
}

const activityIcon: Record<string, string> = {
  bill: 'receipt_long',
  settlement: 'payments',
}
</script>

<template>
  <section class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-8 enter">
    <!-- ============ Greeting ============ -->
    <header class="space-y-1">
      <ClientOnly>
        <h1 class="font-headline-lg text-[var(--md-on-surface)]">{{ greeting }}</h1>
        <template #fallback>
          <h1 class="font-headline-lg text-[var(--md-on-surface)]">
            {{ t('dashboard.greeting', { name: firstName }) }}
          </h1>
        </template>
      </ClientOnly>
      <p class="font-body-md text-[var(--md-on-surface-variant)]">{{ t('dashboard.subhead') }}</p>
    </header>

    <!-- ============ Loading ============ -->
    <div
      v-if="pending && !overview"
      class="grid grid-cols-1 md:grid-cols-12 gap-6"
    >
      <div class="md:col-span-8 h-64 rounded-3xl bg-[var(--md-surface-container-low)] animate-pulse" />
      <div class="md:col-span-4 h-64 rounded-3xl bg-[var(--md-surface-container-low)] animate-pulse" />
    </div>

    <template v-else-if="overview">
      <!-- ============ Bento: Hero balance + Settle-up ============ -->
      <div class="grid grid-cols-1 md:grid-cols-12 gap-4 sm:gap-6">
        <!-- Balance hero card (8 cols) -->
        <section
          class="md:col-span-8 relative overflow-hidden rounded-3xl p-6 sm:p-8
                 bg-[var(--md-surface-container-lowest)] border border-[var(--md-outline-variant)]
                 shadow-[var(--shadow-card)]"
        >
          <div
            class="absolute -top-24 -right-20 size-72 rounded-full
                   bg-[var(--md-primary-container)]/12 blur-3xl"
            aria-hidden="true"
          />
          <div class="relative z-10 space-y-8">
            <div class="space-y-2">
              <p class="kicker !text-[var(--md-primary)]">{{ t('dashboard.totalNetBalance') }}</p>
              <div class="flex items-baseline gap-3 flex-wrap">
                <h2 class="font-display-lg amount text-[var(--md-on-surface)] leading-none">
                  {{ fmt(primaryBalance.currency, primaryBalance.net) }}
                </h2>
                <span
                  v-if="otherBalances.length"
                  class="font-label-sm text-[var(--md-on-surface-variant)]"
                >
                  + {{ otherBalances.length }} other currencies
                </span>
              </div>
              <div v-if="otherBalances.length" class="flex flex-wrap gap-2 pt-2">
                <span
                  v-for="b in otherBalances"
                  :key="b.currency"
                  class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs
                         bg-[var(--md-surface-container)] text-[var(--md-on-surface-variant)] amount"
                >
                  <span class="font-mono">{{ b.currency }}</span>
                  <span>{{ fmt(b.currency, b.net, 'compact') }}</span>
                </span>
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div
                class="p-5 rounded-2xl border border-[var(--md-outline-variant)]/40
                       bg-[var(--md-surface-container-low)]"
              >
                <div class="flex items-center gap-3 mb-2 text-[var(--md-tertiary)]">
                  <span class="size-8 rounded-full bg-[var(--md-tertiary-container)]/15 inline-flex items-center justify-center">
                    <MIcon name="arrow_downward" :size="18" />
                  </span>
                  <span class="font-label-md text-[var(--md-on-surface-variant)]">
                    {{ t('dashboard.youAreOwed') }}
                  </span>
                </div>
                <p class="font-headline-md amount text-[var(--md-on-surface)]">
                  {{ fmt(primaryBalance.currency, primaryBalance.owed) }}
                </p>
              </div>

              <div
                class="p-5 rounded-2xl border border-[var(--md-outline-variant)]/40
                       bg-[var(--md-surface-container-low)]"
              >
                <div class="flex items-center gap-3 mb-2 text-[var(--md-error)]">
                  <span class="size-8 rounded-full bg-[var(--md-error-container)]/30 inline-flex items-center justify-center">
                    <MIcon name="arrow_upward" :size="18" />
                  </span>
                  <span class="font-label-md text-[var(--md-on-surface-variant)]">
                    {{ t('dashboard.youOwe') }}
                  </span>
                </div>
                <p class="font-headline-md amount text-[var(--md-on-surface)]">
                  {{ fmt(primaryBalance.currency, primaryBalance.owes) }}
                </p>
              </div>
            </div>
          </div>
        </section>

        <!-- Settle Up quick action (4 cols) -->
        <section
          class="md:col-span-4 relative overflow-hidden rounded-3xl p-6 sm:p-8
                 hero-primary flex flex-col justify-between min-h-[18rem]"
        >
          <div
            class="absolute -bottom-12 -right-12 size-48 rounded-full bg-white/10 blur-3xl"
            aria-hidden="true"
          />
          <div class="relative z-10 space-y-2">
            <h3 class="font-headline-md">{{ t('dashboard.settleUp') }}</h3>
            <p class="font-body-md text-white/85 leading-snug">
              <template v-if="suggestedCount > 0">
                {{ t('dashboard.settleUpHint', { n: suggestedCount }) }}
              </template>
              <template v-else>
                {{ t('dashboard.allEven') }}
              </template>
            </p>
          </div>
          <div class="relative z-10 space-y-5 mt-6">
            <div v-if="settleAvatars.length" class="flex -space-x-3">
              <BAvatar
                v-for="a in settleAvatars"
                :key="a.name"
                :name="a.name"
                :size="36"
                class="ring-2 ring-[var(--md-primary)]"
              />
            </div>
            <BButton
              to="/app/settlements"
              variant="inverted"
              block
              size="lg"
              icon="payments"
            >
              {{ t('dashboard.payBalances') }}
            </BButton>
          </div>
        </section>
      </div>

      <!-- ============ Active Groups + Recent Activity ============ -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
        <!-- Active Groups (7 cols) -->
        <section class="lg:col-span-7 space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="font-headline-md text-[var(--md-on-surface)]">
              {{ t('dashboard.activeGroups') }}
            </h3>
            <NuxtLink
              to="/app/groups"
              class="text-sm font-label-md text-[var(--md-primary)] hover:underline"
            >
              {{ t('common.viewAll') }}
            </NuxtLink>
          </div>

          <div v-if="!overview.teams.length"
            class="rounded-2xl border-2 border-dashed border-[var(--md-outline-variant)]
                   bg-[var(--md-surface-container-lowest)] p-10 text-center space-y-4"
          >
            <span class="inline-flex size-12 rounded-full bg-[var(--md-surface-container)] items-center justify-center text-[var(--md-on-surface-variant)] mx-auto">
              <MIcon name="group_add" :size="22" />
            </span>
            <p class="font-body-md text-[var(--md-on-surface-variant)]">
              {{ t('dashboard.noGroups') }}
            </p>
            <BButton to="/app/teams/new" icon="add" size="lg">
              {{ t('dashboard.createGroup') }}
            </BButton>
          </div>

          <ul v-else class="space-y-3">
            <li
              v-for="ts in overview.teams"
              :key="ts.team.id"
            >
              <NuxtLink
                :to="`/app/teams/${ts.team.id}`"
                class="group flex items-center gap-4 p-4 sm:p-5 rounded-2xl
                       bg-[var(--md-surface-container-lowest)] border border-[var(--md-outline-variant)]/60
                       shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-lifted)] transition-shadow"
              >
                <span
                  class="size-14 rounded-2xl inline-flex items-center justify-center"
                  :class="tintForTeam(ts.team.id)"
                >
                  <MIcon :name="iconForTeam(ts.team.id)" :size="28" />
                </span>
                <div class="flex-1 min-w-0">
                  <h4 class="font-label-md text-base text-[var(--md-on-surface)] truncate">
                    {{ ts.team.name }}
                  </h4>
                  <p class="font-label-sm text-[var(--md-on-surface-variant)] truncate">
                    {{ t('groups.membersCount', { n: ts.members.length }) }}
                    <span class="mx-1 text-[var(--md-outline)]">·</span>
                    {{ t('groups.billsCount', { n: ts.billCount }) }}
                  </p>
                </div>
                <div class="text-right shrink-0">
                  <p
                    class="font-label-md amount"
                    :class="BigInt(ts.yourBalance) > 0n
                      ? 'text-[var(--md-tertiary)]'
                      : BigInt(ts.yourBalance) < 0n
                        ? 'text-[var(--md-error)]'
                        : 'text-[var(--md-on-surface-variant)]'"
                  >
                    <template v-if="BigInt(ts.yourBalance) > 0n">
                      {{ t('dashboard.owedShort', { amount: fmt(ts.team.defaultCurrency, ts.yourBalance) }) }}
                    </template>
                    <template v-else-if="BigInt(ts.yourBalance) < 0n">
                      {{ t('dashboard.owesShort', { amount: fmt(ts.team.defaultCurrency, (-BigInt(ts.yourBalance)).toString()) }) }}
                    </template>
                    <template v-else>
                      {{ t('dashboard.settledUp') }}
                    </template>
                  </p>
                  <div class="flex -space-x-2 mt-1 justify-end">
                    <BAvatar
                      v-for="m in ts.members.slice(0, 3)"
                      :key="m.id"
                      :name="m.displayName"
                      :size="22"
                      class="ring-2 ring-[var(--md-surface-container-lowest)]"
                    />
                    <span
                      v-if="ts.members.length > 3"
                      class="size-[22px] rounded-full bg-[var(--md-surface-container-high)]
                             text-[10px] font-bold text-[var(--md-on-surface-variant)]
                             inline-flex items-center justify-center ring-2 ring-[var(--md-surface-container-lowest)]"
                    >+{{ ts.members.length - 3 }}</span>
                  </div>
                </div>
              </NuxtLink>
            </li>
          </ul>
        </section>

        <!-- Recent Activity (5 cols) -->
        <section class="lg:col-span-5 space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="font-headline-md text-[var(--md-on-surface)]">
              {{ t('dashboard.recentActivity') }}
            </h3>
            <NuxtLink
              to="/app/activity"
              class="text-sm font-label-md text-[var(--md-primary)] hover:underline"
            >
              {{ t('common.viewAll') }}
            </NuxtLink>
          </div>
          <div
            class="rounded-3xl bg-[var(--md-surface-container-lowest)] border border-[var(--md-outline-variant)]/60
                   shadow-[var(--shadow-card)] p-2 sm:p-4 divide-y divide-[var(--md-outline-variant)]/30"
          >
            <p v-if="!overview.activity.length" class="px-4 py-10 text-center text-sm text-[var(--md-on-surface-variant)]">
              {{ t('dashboard.noActivity') }}
            </p>
            <NuxtLink
              v-for="item in overview.activity"
              :key="`${item.kind}-${item.id}`"
              :to="`/app/teams/${item.teamId}`"
              class="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-2xl
                     hover:bg-[var(--md-surface-container-low)] transition-colors"
            >
              <span
                class="size-10 rounded-full inline-flex items-center justify-center shrink-0"
                :class="item.direction === 'positive'
                  ? 'bg-[var(--md-tertiary-container)]/15 text-[var(--md-tertiary)]'
                  : item.direction === 'negative'
                    ? 'bg-[var(--md-error-container)]/30 text-[var(--md-error)]'
                    : 'bg-[var(--md-surface-container)] text-[var(--md-on-surface-variant)]'"
              >
                <MIcon :name="activityIcon[item.kind] ?? 'receipt_long'" :size="20" />
              </span>
              <div class="flex-1 min-w-0">
                <p class="font-label-md text-sm text-[var(--md-on-surface)] truncate">
                  <span class="font-bold">{{ item.actor.isYou ? 'You' : item.actor.displayName }}</span>
                  <template v-if="item.kind === 'bill'">
                    added "{{ item.title }}"
                  </template>
                  <template v-else>
                    {{ item.title }}
                  </template>
                </p>
                <p class="font-label-sm text-xs text-[var(--md-on-surface-variant)] truncate">
                  {{ timeAgo(item.createdAt) }}
                  <span class="mx-1 text-[var(--md-outline)]">·</span>
                  {{ item.teamName }}
                </p>
              </div>
              <p
                class="font-label-md amount shrink-0 text-sm"
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
        </section>
      </div>
    </template>
  </section>
</template>
