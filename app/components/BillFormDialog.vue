<script setup lang="ts">
// Bill form, mounted as a modal.  Handles create (POST) and edit (PATCH).
//
// Layout follows docs/screen/add-new-expense.html:
//   - Header row: title + close.
//   - 12-col bento: description+date+payer+note (8 col) and a tinted Total
//     Amount card (4 col) with a huge centred numeric input.
//   - "Split with" section with an Equally/Exact segmented control.
//   - Per-member rows with avatar, name, computed share, toggle.
//   - Footer: Cancel + Add Expense / Save.

import type { Bill, BillParticipant, TeamMember } from '~~/server/db/schema'
import { ApiErrorThrown, useApi } from '~/composables/useApi'
import { useMoney } from '~/composables/useMoney'
import { useDates } from '~/composables/useDates'

const props = defineProps<{
  open: boolean
  teamId: string
  members: TeamMember[]
  currency: string
  timezone: string
  /** When provided, the dialog opens in edit mode and prefills from this bill. */
  bill?: (Bill & { participants: BillParticipant[] }) | null
}>()

const emit = defineEmits<{
  close: []
  saved: []
}>()

const { t } = useI18n()

const money = computed(() => useMoney({ currency: props.currency as never }))
const dates = computed(() => useDates(props.timezone))

const form = reactive({
  occurredOn: '',
  description: '',
  note: '',
  totalAmountInput: '',
  paidByMemberId: '',
  participantMemberIds: new Set<string>(),
  /** Per-member custom amount input (string, parsed lazily). Used in 'detail' mode. */
  shareInputs: {} as Record<string, string>,
  splitMode: 'even' as 'even' | 'detail',
})

const submitting = ref(false)
const error = ref<string | null>(null)

const isEdit = computed(() => !!props.bill)

watch(() => props.open, (open) => {
  if (!open) return
  error.value = null
  form.shareInputs = {}
  if (props.bill) {
    form.occurredOn = props.bill.occurredOn
    form.description = props.bill.description
    form.note = props.bill.note ?? ''
    form.totalAmountInput = money.value.format(props.bill.totalAmount, 'verbose')
    form.paidByMemberId = props.bill.paidByMemberId
    form.participantMemberIds = new Set(props.bill.participants.map((p) => p.teamMemberId))
    // Auto-detect: a bill saved as "equal" has shares that differ by ≤1 (the
    // remainder distribution).  Anything else came from the exact path —
    // open the form back into Detail and prefill the per-member inputs.
    const shares = props.bill.participants.map((p) => p.shareAmount)
    const min = shares.reduce((m, s) => (s < m ? s : m), shares[0] ?? 0n)
    const max = shares.reduce((m, s) => (s > m ? s : m), shares[0] ?? 0n)
    const looksEqual = shares.length === 0 || max - min <= 1n
    form.splitMode = looksEqual ? 'even' : 'detail'
    if (!looksEqual) {
      for (const p of props.bill.participants) {
        form.shareInputs[p.teamMemberId] = money.value.format(p.shareAmount, 'verbose')
      }
    }
  } else {
    form.splitMode = 'even'
    form.occurredOn = dates.value.todayYmd()
    form.description = ''
    form.note = ''
    form.totalAmountInput = ''
    form.paidByMemberId = props.members[0]?.id ?? ''
    form.participantMemberIds = new Set(props.members.map((m) => m.id))
  }
}, { immediate: true })

const totalAmount = computed(() => money.value.tryParse(form.totalAmountInput))
const perPerson = computed(() => {
  if (!totalAmount.value || form.participantMemberIds.size === 0) return null
  return totalAmount.value / BigInt(form.participantMemberIds.size)
})

/** Per-member parsed share for the detail-mode UI. Returns null when input is empty/invalid. */
function shareFor(memberId: string): bigint | null {
  if (!form.participantMemberIds.has(memberId)) return null
  const raw = form.shareInputs[memberId]
  if (!raw || !raw.trim()) return null
  return money.value.tryParse(raw)
}

const detailSum = computed(() => {
  if (form.splitMode !== 'detail') return 0n
  let sum = 0n
  for (const id of form.participantMemberIds) {
    const v = shareFor(id)
    if (v && v > 0n) sum += v
  }
  return sum
})

const detailRemaining = computed(() => {
  if (form.splitMode !== 'detail' || totalAmount.value === null) return null
  return totalAmount.value - detailSum.value
})

function toggleParticipant(id: string) {
  if (form.participantMemberIds.has(id)) {
    form.participantMemberIds.delete(id)
    delete form.shareInputs[id]
  } else {
    form.participantMemberIds.add(id)
  }
  form.participantMemberIds = new Set(form.participantMemberIds)
}

/** Distribute the remaining amount across selected members with empty inputs (or all of them, if none are empty). */
function distributeRemaining() {
  if (form.splitMode !== 'detail' || totalAmount.value === null) return
  const ids = Array.from(form.participantMemberIds)
  if (ids.length === 0) return
  const empty = ids.filter((id) => {
    const raw = form.shareInputs[id]
    return !raw || !raw.trim() || money.value.tryParse(raw) === null
  })
  const targets = empty.length > 0 ? empty : ids
  // Spread whatever the form is missing across the chosen targets.  When all
  // members are empty this resolves to a clean equal-split prefill.
  const remaining = empty.length > 0
    ? totalAmount.value - detailSum.value
    : totalAmount.value
  if (remaining <= 0n) return
  const big = BigInt(targets.length)
  const base = remaining / big
  const rem = Number(remaining - base * big)
  targets.forEach((id, i) => {
    const share = i < rem ? base + 1n : base
    form.shareInputs[id] = money.value.format(share, 'verbose')
  })
}

function close() {
  if (submitting.value) return
  emit('close')
}

async function submit() {
  error.value = null
  if (totalAmount.value === null || totalAmount.value <= 0n) {
    error.value = t('bills.errors.totalRequired')
    return
  }
  if (!form.description.trim()) {
    error.value = t('bills.errors.descriptionRequired')
    return
  }
  if (form.participantMemberIds.size === 0) {
    error.value = t('bills.errors.participantsRequired')
    return
  }

  const body: Record<string, unknown> = {
    occurredOn: form.occurredOn,
    description: form.description.trim(),
    note: form.note.trim() || null,
    totalAmount: totalAmount.value.toString(),
    paidByMemberId: form.paidByMemberId,
  }

  if (form.splitMode === 'detail') {
    const shares: Array<{ memberId: string; shareAmount: string }> = []
    for (const id of form.participantMemberIds) {
      const v = shareFor(id)
      if (v === null) {
        error.value = t('bills.errors.shareInvalid')
        return
      }
      if (v <= 0n) {
        error.value = t('bills.errors.shareTooLow')
        return
      }
      shares.push({ memberId: id, shareAmount: v.toString() })
    }
    if (shares.length === 0) {
      error.value = t('bills.errors.participantsRequired')
      return
    }
    if (detailSum.value !== totalAmount.value) {
      error.value = t('bills.errors.shareSumMismatch')
      return
    }
    body.participantShares = shares
  } else {
    body.participantMemberIds = Array.from(form.participantMemberIds)
  }

  submitting.value = true
  try {
    if (isEdit.value && props.bill) {
      await useApi(`/api/bills/${props.bill.id}`, { method: 'PATCH', body })
    } else {
      await useApi(`/api/teams/${props.teamId}/bills`, {
        method: 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body,
      })
    }
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

const canSubmit = computed(() => {
  if (totalAmount.value === null
    || totalAmount.value <= 0n
    || form.description.trim().length === 0
    || form.participantMemberIds.size === 0) {
    return false
  }
  if (form.splitMode === 'detail') {
    if (detailSum.value !== totalAmount.value) return false
    for (const id of form.participantMemberIds) {
      const v = shareFor(id)
      if (v === null || v <= 0n) return false
    }
  }
  return true
})
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
          class="w-full sm:max-w-2xl bg-[var(--md-surface-container-lowest)]
                 border border-[var(--md-outline-variant)]/30
                 rounded-t-3xl sm:rounded-3xl shadow-[var(--shadow-card-lifted)]
                 max-h-[92vh] flex flex-col"
          role="dialog"
          aria-modal="true"
        >
          <form class="flex flex-col flex-1 min-h-0" @submit.prevent="submit">
            <!-- Modal header -->
            <header class="px-6 sm:px-8 pt-6 pb-4 border-b border-[var(--md-outline-variant)]/30 flex items-start justify-between gap-3">
              <div>
                <h2 class="font-headline-lg text-[var(--md-on-surface)]">
                  {{ isEdit ? t('bills.editTitle') : t('bills.addModalTitle') }}
                </h2>
                <p class="font-body-md text-[var(--md-on-surface-variant)] mt-1">
                  {{ t('bills.addSubtitle') }}
                </p>
              </div>
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

            <div class="overflow-y-auto px-6 sm:px-8 py-6 space-y-8">
              <!-- Primary details bento -->
              <div class="grid grid-cols-1 md:grid-cols-12 gap-4 sm:gap-6">
                <div class="md:col-span-8 space-y-5">
                  <div class="space-y-2">
                    <label class="font-label-md text-[var(--md-on-surface-variant)] px-1">
                      {{ t('bills.fields.description') }}
                    </label>
                    <input
                      v-model="form.description"
                      type="text"
                      autocomplete="off"
                      maxlength="140"
                      :placeholder="t('bills.placeholders.description')"
                      class="w-full bg-[var(--md-surface-container-low)] border-none rounded-xl
                             px-4 py-4 focus:ring-2 focus:ring-[var(--md-primary-container)]
                             font-body-lg text-[var(--md-on-surface)]
                             placeholder:text-[var(--md-on-surface-variant)]/60"
                    />
                  </div>

                  <div class="grid grid-cols-2 gap-4">
                    <div class="space-y-2">
                      <label class="font-label-md text-[var(--md-on-surface-variant)] px-1">
                        {{ t('bills.fields.date') }}
                      </label>
                      <div class="relative">
                        <input
                          v-model="form.occurredOn"
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
                        {{ t('bills.fields.payerQuestion') }}
                      </label>
                      <select
                        v-model="form.paidByMemberId"
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
                      {{ t('bills.fields.note') }}
                    </label>
                    <textarea
                      v-model="form.note"
                      rows="2"
                      maxlength="500"
                      :placeholder="t('bills.placeholders.note')"
                      class="w-full bg-[var(--md-surface-container-low)] border-none rounded-xl
                             px-4 py-3 focus:ring-2 focus:ring-[var(--md-primary-container)]
                             font-body-md text-[var(--md-on-surface)]
                             placeholder:text-[var(--md-on-surface-variant)]/60 resize-none"
                    />
                  </div>
                </div>

                <!-- Total amount card -->
                <div
                  class="md:col-span-4 bg-[var(--md-primary-container)]/10 rounded-2xl p-6
                         flex flex-col justify-center items-center space-y-2
                         border border-[var(--md-primary-container)]/25"
                >
                  <label class="font-label-md text-[var(--md-primary)]">
                    {{ t('bills.fields.total') }}
                  </label>
                  <div class="flex items-baseline gap-1 text-[var(--md-primary)] w-full">
                    <span class="text-xl font-bold font-mono">{{ currency }}</span>
                    <input
                      v-model="form.totalAmountInput"
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
                    v-if="totalAmount !== null"
                    class="font-label-sm text-[var(--md-primary)]/70 font-mono"
                  >
                    {{ money.format(totalAmount, 'verbose') }}
                  </p>
                </div>
              </div>

              <!-- Split with -->
              <div class="space-y-4">
                <div class="flex items-center justify-between gap-3 flex-wrap">
                  <h3 class="font-headline-md text-[var(--md-on-surface)]">
                    {{ t('bills.fields.participants') }}
                  </h3>
                  <div class="seg-rail">
                    <button
                      type="button"
                      class="seg-tab"
                      :class="{ 'seg-tab-active': form.splitMode === 'even' }"
                      @click="form.splitMode = 'even'"
                    >
                      {{ t('bills.split.even') }}
                    </button>
                    <button
                      type="button"
                      class="seg-tab"
                      :class="{ 'seg-tab-active': form.splitMode === 'detail' }"
                      @click="form.splitMode = 'detail'"
                    >
                      {{ t('bills.split.detail') }}
                    </button>
                  </div>
                </div>

                <p
                  v-if="form.splitMode === 'even' && perPerson !== null"
                  class="font-label-sm text-[var(--md-on-surface-variant)] amount px-1"
                >
                  {{ t('bills.perPerson', { amount: money.format(perPerson, 'compact'), n: form.participantMemberIds.size }) }}
                </p>

                <div
                  v-else-if="form.splitMode === 'detail' && totalAmount !== null"
                  class="rounded-xl px-4 py-3 flex items-center justify-between gap-3 border"
                  :class="detailRemaining === 0n
                    ? 'bg-[var(--md-primary-container)]/15 border-[var(--md-primary)]/25 text-[var(--md-primary)]'
                    : 'bg-[var(--md-surface-container-low)] border-[var(--md-outline-variant)]/40 text-[var(--md-on-surface-variant)]'"
                >
                  <div class="font-label-sm amount">
                    {{ t('bills.detail.sumLine', {
                      sum: money.format(detailSum, 'compact'),
                      total: money.format(totalAmount, 'compact'),
                    }) }}
                  </div>
                  <div class="flex items-center gap-3">
                    <span
                      v-if="detailRemaining !== null && detailRemaining !== 0n"
                      class="font-label-sm amount"
                    >
                      {{ detailRemaining > 0n
                        ? t('bills.detail.remaining', { amount: money.format(detailRemaining, 'compact') })
                        : t('bills.detail.over',      { amount: money.format(-detailRemaining, 'compact') }) }}
                    </span>
                    <button
                      v-if="detailRemaining !== null && detailRemaining > 0n"
                      type="button"
                      class="font-label-sm text-[var(--md-primary)] underline-offset-2 hover:underline"
                      @click="distributeRemaining"
                    >
                      {{ t('bills.detail.distribute') }}
                    </button>
                  </div>
                </div>

                <div class="space-y-3">
                  <button
                    v-for="m in members"
                    :key="m.id"
                    type="button"
                    class="w-full flex items-center justify-between gap-3 p-4 rounded-2xl
                           bg-[var(--md-surface-container-lowest)] border transition-all
                           shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-lifted)] text-left"
                    :class="form.participantMemberIds.has(m.id)
                      ? 'border-[var(--md-primary)]'
                      : 'border-[var(--md-outline-variant)]/30'"
                    @click="toggleParticipant(m.id)"
                  >
                    <div class="flex items-center gap-4 min-w-0">
                      <BAvatar
                        :name="m.displayName"
                        :size="44"
                        :ring="m.id === form.paidByMemberId"
                      />
                      <div class="min-w-0">
                        <p class="font-label-md text-[var(--md-on-surface)] truncate">
                          {{ m.displayName }}
                          <span
                            v-if="m.id === form.paidByMemberId"
                            class="text-[var(--md-primary)] font-label-sm"
                          >· Paid</span>
                        </p>
                        <p class="font-label-sm text-[var(--md-on-surface-variant)]">
                          <template v-if="m.role === 'owner'">Owner</template>
                          <template v-else>Member</template>
                        </p>
                      </div>
                    </div>
                    <div class="flex items-center gap-4 shrink-0" @click.stop>
                      <input
                        v-if="form.splitMode === 'detail' && form.participantMemberIds.has(m.id)"
                        v-model="form.shareInputs[m.id]"
                        type="text"
                        inputmode="decimal"
                        autocomplete="off"
                        :placeholder="currency === 'VND' ? '0' : '0.00'"
                        :aria-label="t('bills.detail.shareForLabel', { name: m.displayName })"
                        class="w-28 sm:w-32 bg-[var(--md-surface-container-low)] border-none rounded-lg
                               px-3 py-2 focus:ring-2 focus:ring-[var(--md-primary-container)]
                               font-label-md text-right amount text-[var(--md-on-surface)]
                               placeholder:text-[var(--md-on-surface-variant)]/60"
                      />
                      <p
                        v-else
                        class="font-headline-md amount"
                        :class="form.participantMemberIds.has(m.id)
                          ? 'text-[var(--md-primary)]'
                          : 'text-[var(--md-on-surface-variant)]'"
                      >
                        {{ form.participantMemberIds.has(m.id) && perPerson !== null
                          ? money.format(perPerson, 'compact')
                          : money.format(0n, 'compact') }}
                      </p>
                      <span
                        class="w-12 h-6 rounded-full relative flex items-center transition-colors cursor-pointer"
                        :class="form.participantMemberIds.has(m.id)
                          ? 'bg-[var(--md-primary-container)]'
                          : 'bg-[var(--md-surface-container-high)]'"
                        role="switch"
                        :aria-checked="form.participantMemberIds.has(m.id)"
                        :aria-label="form.participantMemberIds.has(m.id)
                          ? t('bills.detail.toggleOff', { name: m.displayName })
                          : t('bills.detail.toggleOn',  { name: m.displayName })"
                        @click="toggleParticipant(m.id)"
                      >
                        <span
                          class="size-4 bg-white rounded-full absolute transition-all"
                          :class="form.participantMemberIds.has(m.id) ? 'right-1' : 'left-1'"
                        />
                      </span>
                    </div>
                  </button>
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
            </div>

            <!-- Footer -->
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
                {{ isEdit ? t('common.save') : t('bills.add') }}
              </BButton>
            </footer>
          </form>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
