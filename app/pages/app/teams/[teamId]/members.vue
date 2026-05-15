<script setup lang="ts">
// Team members + invite links.  Owners can promote, remove, create and
// revoke invite links; everyone else gets a read-only roster.

import type { Team, TeamInvite, TeamMember } from '~~/server/db/schema'
import { ApiErrorThrown, useApi } from '~/composables/useApi'
import { useAppToast } from '~/composables/useAppToast'

definePageMeta({ layout: 'app' })

const route = useRoute()
const { t } = useI18n()
const { add: toast } = useAppToast()
const teamId = computed(() => route.params.teamId as string)

const { data: teamData } = await useAsyncData(
  () => `team-${teamId.value}`,
  () => useApi<{ team: Team; member: TeamMember }>(`/api/teams/${teamId.value}`),
)
const isOwner = computed(() => teamData.value?.member.role === 'owner')

const { data: membersData, refresh: refreshMembers } = await useAsyncData(
  () => `members-${teamId.value}`,
  () => useApi<{ members: TeamMember[] }>(`/api/teams/${teamId.value}/members`),
)
const members = computed(() => membersData.value?.members ?? [])

const { data: invitesData, refresh: refreshInvites } = await useAsyncData(
  () => `invites-${teamId.value}`,
  async () => {
    if (!isOwner.value) return { invites: [] as TeamInvite[] }
    return useApi<{ invites: TeamInvite[] }>(`/api/teams/${teamId.value}/invites`)
  },
  { watch: [isOwner] },
)
const invites = computed(() => invitesData.value?.invites ?? [])

async function createInvite() {
  try {
    const res = await useApi<{ invite: TeamInvite; url: string }>(
      `/api/teams/${teamId.value}/invites`,
      { method: 'POST', body: { expiresInHours: 24 * 7 } },
    )
    await refreshInvites()
    await copyToClipboard(res.url)
  } catch {
    toast({ title: t('errors.INTERNAL'), color: 'error' })
  }
}

async function copyInvite(token: string) {
  const baseUrl = useRuntimeConfig().public.baseUrl.replace(/\/$/, '')
  await copyToClipboard(`${baseUrl}/invite/${token}`)
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast({ title: t('teams.invites.copied'), color: 'success' })
  } catch {
    toast({ title: text, color: 'info', description: t('teams.invites.copyManual') })
  }
}

async function revokeInvite(invite: TeamInvite) {
  try {
    await useApi(`/api/teams/${teamId.value}/invites/${invite.id}`, { method: 'DELETE' })
    await refreshInvites()
  } catch {
    toast({ title: t('errors.INTERNAL'), color: 'error' })
  }
}

async function promoteMember(member: TeamMember) {
  if (!confirm(t('teams.members.confirmPromote', { name: member.displayName }))) return
  try {
    await useApi(`/api/teams/${teamId.value}/members/${member.id}/role`, {
      method: 'PATCH',
      body: { role: 'owner' },
    })
    await refreshMembers()
  } catch {
    toast({ title: t('errors.INTERNAL'), color: 'error' })
  }
}

async function removeMember(member: TeamMember) {
  if (!confirm(t('teams.members.confirmRemove', { name: member.displayName }))) return
  try {
    await useApi(`/api/teams/${teamId.value}/members/${member.id}`, { method: 'DELETE' })
    await refreshMembers()
  } catch (e) {
    if (e instanceof ApiErrorThrown && e.code === 'FORBIDDEN') {
      toast({ title: t('teams.members.cannotRemoveLastOwner'), color: 'error' })
    } else {
      toast({ title: t('errors.INTERNAL'), color: 'error' })
    }
  }
}
</script>

<template>
  <div v-if="teamData" class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-8 enter">
    <header class="space-y-3">
      <NuxtLink
        :to="`/app/teams/${teamId}`"
        class="kicker hover:text-[var(--md-primary)] inline-flex items-center gap-1.5 transition-colors"
      >
        <MIcon name="arrow_back" :size="14" />
        {{ teamData.team.name }}
      </NuxtLink>
      <h1 class="font-headline-lg text-[var(--md-on-surface)]">{{ t('teams.tabs.members') }}</h1>
    </header>

    <TeamNav :team-id="teamId" />

    <!-- Invite links (owner only) -->
    <section v-if="isOwner" class="space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="font-headline-md text-[var(--md-on-surface)]">{{ t('teams.invites.title') }}</h2>
        <BButton variant="tonal" size="sm" icon="link" @click="createInvite">
          {{ t('teams.invites.create') }}
        </BButton>
      </div>

      <ul
        v-if="invites.length"
        class="rounded-2xl bg-[var(--md-surface-container-lowest)] border border-[var(--md-outline-variant)]/60
               shadow-[var(--shadow-card)] divide-y divide-[var(--md-outline-variant)]/30 overflow-hidden"
      >
        <li
          v-for="invite in invites"
          :key="invite.id"
          class="flex items-center gap-3 px-5 py-4"
        >
          <code class="text-xs font-mono text-[var(--md-on-surface)] bg-[var(--md-surface-container)] px-2 py-1 rounded shrink-0">
            {{ invite.token.slice(0, 8) }}…
          </code>
          <div class="text-xs text-[var(--md-on-surface-variant)] flex-1 min-w-0 truncate">
            <span v-if="invite.expiresAt">
              {{ t('teams.invites.expiresAt', { date: new Date(invite.expiresAt).toLocaleString() }) }}
            </span>
            <span v-else>{{ t('teams.invites.noExpiry') }}</span>
          </div>
          <button
            type="button"
            class="size-8 rounded-full inline-flex items-center justify-center text-[var(--md-on-surface-variant)]
                   hover:bg-[var(--md-surface-container-high)] hover:text-[var(--md-on-surface)] transition-colors"
            :aria-label="t('teams.invites.copied')"
            @click="copyInvite(invite.token)"
          >
            <MIcon name="content_copy" :size="16" />
          </button>
          <button
            type="button"
            class="size-8 rounded-full inline-flex items-center justify-center text-[var(--md-on-surface-variant)]
                   hover:bg-[var(--md-error-container)]/30 hover:text-[var(--md-error)] transition-colors"
            @click="revokeInvite(invite)"
          >
            <MIcon name="close" :size="16" />
          </button>
        </li>
      </ul>
      <p v-else class="text-sm text-[var(--md-on-surface-variant)]">{{ t('teams.invites.none') }}</p>
    </section>

    <!-- Members -->
    <section class="space-y-4">
      <h2 class="font-headline-md text-[var(--md-on-surface)]">{{ t('teams.members.title') }}</h2>
      <ul
        class="rounded-2xl bg-[var(--md-surface-container-lowest)] border border-[var(--md-outline-variant)]/60
               shadow-[var(--shadow-card)] divide-y divide-[var(--md-outline-variant)]/30 overflow-hidden"
      >
        <li
          v-for="m in members"
          :key="m.id"
          class="flex items-center gap-3 px-5 py-4"
        >
          <BAvatar :name="m.displayName" :size="40" />
          <div class="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
            <span class="font-label-md text-[var(--md-on-surface)] truncate">{{ m.displayName }}</span>
            <span
              v-if="m.role === 'owner'"
              class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--md-primary-container)]/15 text-[var(--md-primary)] text-xs font-label-md"
            >
              <MIcon name="shield" :size="12" />
              {{ t('teams.roles.owner') }}
            </span>
          </div>
          <div v-if="isOwner && m.role !== 'owner'" class="flex items-center gap-1">
            <button
              type="button"
              class="size-8 rounded-full inline-flex items-center justify-center text-[var(--md-primary)]
                     hover:bg-[var(--md-primary-container)]/15 transition-colors"
              :title="t('teams.members.promote')"
              @click="promoteMember(m)"
            >
              <MIcon name="shield_person" :size="18" />
            </button>
            <button
              type="button"
              class="size-8 rounded-full inline-flex items-center justify-center text-[var(--md-on-surface-variant)]
                     hover:bg-[var(--md-error-container)]/30 hover:text-[var(--md-error)] transition-colors"
              @click="removeMember(m)"
            >
              <MIcon name="person_remove" :size="18" />
            </button>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>
