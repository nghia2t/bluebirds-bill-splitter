<script setup lang="ts">
// Groups index — the full list of teams the signed-in user is in.
//
// Visually a richer cousin of the dashboard's "Active Groups" card: each row
// still gets an icon tile + member avatar stack + balance pill, but here we
// can afford more breathing room and add the "create a group" CTA at the top.

import type { UserOverview } from '~~/server/services/user-overview'
import { useApi } from '~/composables/useApi'
import { useMoney } from '~/composables/useMoney'
import { isCurrency } from '~~/shared/currency'

definePageMeta({ layout: 'app' })

const { t } = useI18n()

const { data, pending } = await useAsyncData('me-overview-groups', () =>
  useApi<UserOverview>('/api/me/overview?activityLimit=0'),
)
const overview = computed(() => data.value)

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

function fmt(currency: string, amount: string): string {
  return isCurrency(currency) ? useMoney({ currency }).format(amount) : amount
}
</script>

<template>
  <section class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-8 enter">
    <header class="flex items-start justify-between gap-4 flex-wrap">
      <div class="space-y-1.5 min-w-0">
        <p class="kicker !text-[var(--md-primary)]">{{ t('app.allGroups') }}</p>
        <h1 class="font-headline-lg text-[var(--md-on-surface)]">{{ t('groups.title') }}</h1>
        <p class="font-body-md text-[var(--md-on-surface-variant)] max-w-prose">
          {{ t('groups.subhead') }}
        </p>
      </div>
      <BButton to="/app/teams/new" icon="add" size="lg">
        {{ t('app.createTeam') }}
      </BButton>
    </header>

    <div v-if="pending && !overview" class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div v-for="n in 4" :key="n" class="h-28 rounded-2xl bg-[var(--md-surface-container-low)] animate-pulse" />
    </div>

    <template v-else-if="overview">
      <div
        v-if="!overview.teams.length"
        class="rounded-2xl border-2 border-dashed border-[var(--md-outline-variant)]
               bg-[var(--md-surface-container-lowest)] p-10 sm:p-16 text-center space-y-5"
      >
        <span
          class="inline-flex size-14 rounded-full bg-[var(--md-surface-container)]
                 items-center justify-center text-[var(--md-on-surface-variant)] mx-auto"
        >
          <MIcon name="group_add" :size="26" />
        </span>
        <p class="font-headline-md text-[var(--md-on-surface)]">{{ t('app.noTeamsYet') }}</p>
        <BButton to="/app/teams/new" size="lg" icon="add">
          {{ t('app.createFirstTeam') }}
        </BButton>
      </div>

      <ul v-else class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <li v-for="ts in overview.teams" :key="ts.team.id">
          <NuxtLink
            :to="`/app/teams/${ts.team.id}`"
            class="group h-full flex flex-col gap-4 p-5 rounded-2xl
                   bg-[var(--md-surface-container-lowest)] border border-[var(--md-outline-variant)]/60
                   shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-lifted)] transition-shadow"
          >
            <div class="flex items-start justify-between gap-3">
              <span
                class="size-14 rounded-2xl inline-flex items-center justify-center"
                :class="tintForTeam(ts.team.id)"
              >
                <MIcon :name="iconForTeam(ts.team.id)" :size="28" />
              </span>
              <div class="flex -space-x-2 justify-end">
                <BAvatar
                  v-for="m in ts.members.slice(0, 3)"
                  :key="m.id"
                  :name="m.displayName"
                  :size="28"
                  class="ring-2 ring-[var(--md-surface-container-lowest)]"
                />
                <span
                  v-if="ts.members.length > 3"
                  class="size-7 rounded-full bg-[var(--md-surface-container-high)]
                         text-[10px] font-bold text-[var(--md-on-surface-variant)]
                         inline-flex items-center justify-center ring-2 ring-[var(--md-surface-container-lowest)]"
                >+{{ ts.members.length - 3 }}</span>
              </div>
            </div>

            <div class="space-y-1">
              <h3 class="font-headline-md text-base text-[var(--md-on-surface)] truncate">
                {{ ts.team.name }}
              </h3>
              <p class="font-label-sm text-[var(--md-on-surface-variant)] truncate">
                {{ t('groups.membersCount', { n: ts.members.length }) }}
                <span class="mx-1 text-[var(--md-outline)]">·</span>
                <span class="font-mono">{{ ts.team.defaultCurrency }}</span>
              </p>
            </div>

            <div class="mt-auto flex items-center justify-between">
              <p
                class="font-label-md amount text-sm"
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
                  {{ t('groups.noBalance') }}
                </template>
              </p>
              <MIcon
                name="arrow_forward"
                :size="20"
                class="text-[var(--md-outline)] group-hover:text-[var(--md-primary)] transition-colors"
              />
            </div>
          </NuxtLink>
        </li>
      </ul>
    </template>
  </section>
</template>
