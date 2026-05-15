<script setup lang="ts">
// Record-a-payment modal.  Visual rhythm mirrors BillFormDialog so the two
// flows feel like one system: title row, big amount card, two member
// selects, date + optional note.
//
// Prefill pattern: clicking "Record" next to a suggested transfer or "Pay"
// on a balance row prefills from/to/amount so the user can confirm with one
// tap.  Opening without a prefill yields a blank form.

import type { TeamMember } from '~~/server/db/schema'
import { ApiErrorThrown, useApi } from '~/composables/useApi'
import { useMoney } from '~/composables/useMoney'
import { useDates } from '~/composables/useDates'

const props = defineProps<{
  open: boolean
  teamId: string
  members: TeamMember[]
  currency: string
  timezone: string
  /** When provided, prefills from / to / amount on open. */
  prefill?: { fromMemberId: string; toMemberId: string; amount: string } | null
}>()

const emit = defineEmits<{
  close: []
  saved: []
}>()

const { t } = useI18n()

const money = computed(() => useMoney({ currency: props.currency as never }))
const dates = computed(() => useDates(props.timezone))

const form = reactive({
  fromMemberId: '',
  toMemberId: '',
  amountInput: '',
  settledOn: '',
  note: '',
})

const submitting = ref(false)
const error = ref<string | null>(null)

watch(() => props.open, (open) => {
  if (!open) return
  error.value = null
  form.settledOn = dates.value.todayYmd()
  if (props.prefill) {
    form.fromMemberId = props.prefill.fromMemberId
    form.toMemberId = props.prefill.toMemberId
    form.amountInput = money.value.format(props.prefill.amount, 'verbose')
  } else {
    form.fromMemberId = props.members[0]?.id ?? ''
    form.toMemberId = props.members[1]?.id ?? props.members[0]?.id ?? ''
    form.amountInput = ''
  }
  form.note = ''
}, { immediate: true })

const recordAmount = computed(() => money.value.tryParse(form.amountInput))

function close() {
  if (submitting.value) return
  emit('close')
}

async function submit() {
  error.value = null
  if (form.fromMemberId === form.toMemberId) {
    error.value = t('settlements.errors.sameMember')
    return
  }
  if (recordAmount.value === null || recordAmount.value <= 0n) {
    error.value = t('settlements.errors.amountRequired')
    return
  }
  submitting.value = true
  try {
    await useApi(`/api/teams/${props.teamId}/settlements`, {
      method: 'POST',
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      body: {
        fromMemberId: form.fromMemberId,
        toMemberId: form.toMemberId,
        amount: recordAmount.value.toString(),
        settledOn: form.settledOn,
        note: form.note.trim() || undefined,
      },
    })
    emit('saved')
    emit('close')
  } catch (e) {
    error.value = e instanceof ApiErrorThrown
      ? t(`errors.${e.code}` as 'errors.INTERNAL')
      : t('errors.INTERNAL')
  } finally {
    submitting.value = false
  }
}

const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && props.open) close() }
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))

const canSubmit = computed(() =>
  recordAmount.value !== null
  && recordAmount.value > 0n
  && form.fromMemberId !== ''
  && form.toMemberId !== ''
  && form.fromMemberId !== form.toMemberId,
)
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-150 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-100 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-end sm:items-center justify-center
               bg-[var(--md-inverse-surface)]/40 backdrop-blur-md p-0 sm:p-4"
        @click.self="close"
      >
        <div
          class="w-full sm:max-w-lg bg-[var(--md-surface-container-lowest)]
                 border border-[var(--md-outline-variant)]/30
                 rounded-t-3xl sm:rounded-3xl shadow-[var(--shadow-card-lifted)]
                 max-h-[92vh] flex flex-col"
          role="dialog"
          aria-modal="true"
        >
          <form class="flex flex-col flex-1 min-h-0" @submit.prevent="submit">
            <header class="px-6 sm:px-8 pt-6 pb-4 border-b border-[var(--md-outline-variant)]/30 flex items-start justify-between gap-3">
              <h2 class="font-headline-lg text-[var(--md-on-surface)]">
                {{ t('settlements.recordTitle') }}
              </h2>
              <button
                type="button"
                class="size-10 rounded-full inline-flex items-center justify-center
                       text-[var(--md-on-surface-variant)] hover:bg-[var(--md-surface-container)] transition-colors"
                :aria-label="t('common.close')"
                @click="close"
              >
                <MIcon name="close" :size="22" />
              </button>
            </header>

            <div class="overflow-y-auto px-6 sm:px-8 py-6 space-y-6">
              <!-- Big amount card -->
              <div
                class="bg-[var(--md-primary-container)]/10 rounded-2xl p-6
                       flex flex-col justify-center items-center space-y-2
                       border border-[var(--md-primary-container)]/25"
              >
                <label class="font-label-md text-[var(--md-primary)]">
                  {{ t('settlements.fields.amount') }}
                </label>
                <div class="flex items-baseline gap-1 text-[var(--md-primary)] w-full">
                  <span class="text-xl font-bold font-mono">{{ currency }}</span>
                  <input
                    v-model="form.amountInput"
                    type="text"
                    inputmode="decimal"
                    autocomplete="off"
                    :placeholder="currency === 'VND' ? '0' : '0.00'"
                    class="w-full bg-transparent border-none focus:ring-0 text-center p-0
                           font-headline-lg font-bold amount
                           placeholder:text-[var(--md-primary)]/30"
                  />
                </div>
                <p
                  v-if="recordAmount !== null"
                  class="font-label-sm text-[var(--md-primary)]/70 font-mono"
                >
                  {{ money.format(recordAmount, 'verbose') }}
                </p>
              </div>

              <div class="grid grid-cols-2 gap-4">
                <div class="space-y-2">
                  <label class="font-label-md text-[var(--md-on-surface-variant)] px-1">
                    {{ t('settlements.fields.from') }}
                  </label>
                  <select
                    v-model="form.fromMemberId"
                    class="w-full bg-[var(--md-surface-container-low)] border-none rounded-xl
                           px-4 py-4 focus:ring-2 focus:ring-[var(--md-primary-container)]
                           font-body-md text-[var(--md-on-surface)] appearance-none"
                  >
                    <option v-for="m in members" :key="m.id" :value="m.id">{{ m.displayName }}</option>
                  </select>
                </div>
                <div class="space-y-2">
                  <label class="font-label-md text-[var(--md-on-surface-variant)] px-1">
                    {{ t('settlements.fields.to') }}
                  </label>
                  <select
                    v-model="form.toMemberId"
                    class="w-full bg-[var(--md-surface-container-low)] border-none rounded-xl
                           px-4 py-4 focus:ring-2 focus:ring-[var(--md-primary-container)]
                           font-body-md text-[var(--md-on-surface)] appearance-none"
                  >
                    <option v-for="m in members" :key="m.id" :value="m.id">{{ m.displayName }}</option>
                  </select>
                </div>
              </div>

              <div class="space-y-2">
                <label class="font-label-md text-[var(--md-on-surface-variant)] px-1">
                  {{ t('settlements.fields.settledOn') }}
                </label>
                <div class="relative">
                  <input
                    v-model="form.settledOn"
                    type="date"
                    class="w-full bg-[var(--md-surface-container-low)] border-none rounded-xl
                           px-4 py-4 pr-12 focus:ring-2 focus:ring-[var(--md-primary-container)]
                           font-body-md text-[var(--md-on-surface)]"
                  />
                  <MIcon
                    name="calendar_today"
                    :size="20"
                    class="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--md-on-surface-variant)] pointer-events-none"
                  />
                </div>
              </div>

              <div class="space-y-2">
                <label class="font-label-md text-[var(--md-on-surface-variant)] px-1">
                  {{ t('settlements.fields.note') }}
                </label>
                <textarea
                  v-model="form.note"
                  rows="2"
                  maxlength="280"
                  :placeholder="t('settlements.placeholders.note')"
                  class="w-full bg-[var(--md-surface-container-low)] border-none rounded-xl
                         px-4 py-3 focus:ring-2 focus:ring-[var(--md-primary-container)]
                         font-body-md text-[var(--md-on-surface)]
                         placeholder:text-[var(--md-on-surface-variant)]/60 resize-none"
                />
              </div>

              <div
                v-if="error"
                class="rounded-xl bg-[var(--md-error-container)]/30 border border-[var(--md-error)]/30 px-4 py-3
                       text-[var(--md-error)] font-label-md flex items-center gap-2"
              >
                <MIcon name="error" :size="20" />
                {{ error }}
              </div>
            </div>

            <footer class="px-6 sm:px-8 py-5 border-t border-[var(--md-outline-variant)]/30 flex gap-4">
              <BButton type="button" variant="outlined" size="xl" block @click="close">
                {{ t('common.cancel') }}
              </BButton>
              <BButton
                type="submit"
                size="xl"
                block
                :loading="submitting"
                :disabled="!canSubmit && !submitting"
              >
                {{ t('settlements.record') }}
              </BButton>
            </footer>
          </form>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
