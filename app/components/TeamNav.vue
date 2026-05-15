<script setup lang="ts">
// Three-tab in-team nav: Ledger (the running view that owns balances,
// suggested transfers, bills and recorded payments), Members, Settings.
//
// Lives at the top of every team-scoped page below the layout's app shell.
// On mobile it renders as a horizontal segmented control under the page
// header (the app's primary bottom nav is the cross-team one).

const props = defineProps<{ teamId: string }>()
const route = useRoute()
const { t } = useI18n()

const tabs = computed(() => [
  {
    key: 'ledger',
    label: t('teams.tabs.ledger'),
    to: `/app/teams/${props.teamId}`,
    icon: 'receipt_long',
    isActive: route.path === `/app/teams/${props.teamId}`,
  },
  {
    key: 'members',
    label: t('teams.tabs.members'),
    to: `/app/teams/${props.teamId}/members`,
    icon: 'group',
    isActive: route.path === `/app/teams/${props.teamId}/members`,
  },
  {
    key: 'settings',
    label: t('teams.tabs.settings'),
    to: `/app/teams/${props.teamId}/settings`,
    icon: 'tune',
    isActive: route.path === `/app/teams/${props.teamId}/settings`,
  },
])
</script>

<template>
  <nav class="seg-rail max-w-full overflow-x-auto no-scrollbar" :aria-label="t('teams.tabs.ledger')">
    <NuxtLink
      v-for="tab in tabs"
      :key="tab.key"
      :to="tab.to"
      class="seg-tab"
      :class="{ 'seg-tab-active': tab.isActive }"
    >
      <MIcon :name="tab.icon" :filled="tab.isActive" :size="18" />
      {{ tab.label }}
    </NuxtLink>
  </nav>
</template>
