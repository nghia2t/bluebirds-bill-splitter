<script setup lang="ts">
// Group details — the running ledger for one team.
//
// Mirrors bluebirds-group-details.html:
//   - Breadcrumb (Groups → name).
//   - Title row w/ Settle Up + Add Expense buttons.
//   - 12-col bento: 4-col left rail (Group Balances + Total Group Spend hero
//     primary card) and 8-col right column (Expenses list).
//   - Below the bento: suggested transfers + recorded payment history.
//
// The mobile FAB and sidebar "Add Expense" buttons both deep-link to
// `?new=1`, which opens the bill dialog on mount.
import type { Bill, BillParticipant, Settlement, Team, TeamMember } from '~~/server/db/schema'
import { ApiErrorThrown, useApi } from '~/composables/useApi'
import { useMoney } from '~/composables/useMoney'
import { useDates } from '~/composables/useDates'
import { useAppToast } from '~/composables/useAppToast'

definePageMeta({ layout: 'app' })

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const { add: toast } = useAppToast()
const teamId = computed(() => route.params.teamId as string)

interface LedgerResponse {
  members: TeamMember[]
  bills: Array<Bill & { participants: BillParticipant[] }>
  settlements: Settlement[]
  view: {
    totals: { billCount: number; spent: string; settlementCount: number; settled: string }
    balances: Array<{ memberId: string; displayName: string; balance: string }>
    plan: { balances: unknown[]; transfers: Array<{ fromMemberId: string; toMemberId: string; amount: string }> } | null
  }
}

const { data: teamData } = await useAsyncData(
  () => `team-${teamId.value}`,
  async () => {
    try {
      return await useApi<{ team: Team; member: TeamMember }>(`/api/teams/${teamId.value}`)
    } catch (e) {
      if (e instanceof ApiErrorThrown && (e.code === 'NOT_FOUND' || e.code === 'FORBIDDEN')) {
        throw createError({ statusCode: 404, statusMessage: 'Team not found' })
      }
      throw e
    }
  },
)
const team = computed(() => teamData.value?.team)
const member = computed(() => teamData.value?.member)
const isOwner = computed(() => member.value?.role === 'owner')

const { data: ledger, refresh } = await useAsyncData(
  () => `ledger-${teamId.value}`,
  () => useApi<LedgerResponse>(`/api/teams/${teamId.value}/ledger`),
  {
    getCachedData: (key, nuxt) =>
      nuxt.isHydrating ? nuxt.payload.data[key] : undefined,
  },
)

const money = computed(() => team.value
  ? useMoney({ currency: team.value.defaultCurrency as never })
  : null,
)
const dates = computed(() => team.value ? useDates(team.value.timezone) : null)

const memberById = computed(() => {
  const m = new Map<string, TeamMember>()
  for (const tm of ledger.value?.members ?? []) m.set(tm.id, tm)
  return m
})
const memberName = (id: string) => memberById.value.get(id)?.displayName ?? '?'
const memberPaymentInfo = (id: string) => memberById.value.get(id)?.paymentInfo ?? null

const totalSpent = computed<bigint>(() => {
  if (!ledger.value) return 0n
  let total = 0n
  for (const b of ledger.value.bills) total += BigInt(b.totalAmount)
  return total
})

const myBalance = computed<bigint>(() => {
  if (!ledger.value || !member.value) return 0n
  const b = ledger.value.view.balances.find((x) => x.memberId === member.value!.id)
  return b ? BigInt(b.balance) : 0n
})

// --- Balances list: relative to "you", with one-tap pay button when you owe ----
interface BalanceRow {
  member: TeamMember
  balance: bigint
  /** From the user's POV: 'owes-you' / 'you-owe' / 'settled' / 'other' */
  flavor: 'owes-you' | 'you-owe' | 'settled' | 'other'
}
const balanceRows = computed<BalanceRow[]>(() => {
  if (!ledger.value || !member.value) return []
  const out: BalanceRow[] = []
  for (const b of ledger.value.view.balances) {
    if (b.memberId === member.value.id) continue
    const m = memberById.value.get(b.memberId)
    if (!m) continue
    const bal = BigInt(b.balance)
    let flavor: BalanceRow['flavor'] = 'other'
    if (bal === 0n) flavor = 'settled'
    else if (bal < 0n) flavor = 'owes-you' // they owe -> bal negative, but their balance vs YOURS — we need a relative
    // Note: the per-member balance already accounts for everyone, so a negative
    // balance means that member owes the group (not necessarily you).  For the
    // UI we instead consult the suggested transfers to decide if there's a
    // direct "you ↔ them" relationship.
    out.push({ member: m, balance: bal, flavor })
  }
  // Re-assign flavors using suggested transfers (more useful than raw balance).
  if (ledger.value.view.plan) {
    for (const tr of ledger.value.view.plan.transfers) {
      const fromYou = tr.fromMemberId === member.value!.id
      const toYou = tr.toMemberId === member.value!.id
      if (!fromYou && !toYou) continue
      const otherId = fromYou ? tr.toMemberId : tr.fromMemberId
      const row = out.find((r) => r.member.id === otherId)
      if (!row) continue
      row.flavor = fromYou ? 'you-owe' : 'owes-you'
    }
    // Anyone not in transfers but with non-zero balance vs ours sits at 'other'.
  }
  for (const r of out) {
    if (r.flavor === 'other' && r.balance === 0n) r.flavor = 'settled'
  }
  return out
})

// --- bill dialog state ------------------------------------------------------
type LedgerBill = Bill & { participants: BillParticipant[] }
const billDialog = reactive<{ open: boolean; bill: LedgerBill | null }>({
  open: false,
  bill: null,
})

function openNewBill() {
  billDialog.bill = null
  billDialog.open = true
}
function openEditBill(bill: LedgerBill) {
  billDialog.bill = bill
  billDialog.open = true
}
function closeBillDialog() {
  billDialog.open = false
}

// Auto-open the new-bill dialog when arriving with ?new=1 (the sidebar /
// mobile FAB sends users here that way).  We strip the query immediately so
// a refresh doesn't re-open it.
onMounted(() => {
  if (route.query.new === '1') {
    openNewBill()
    router.replace({ path: route.path, query: { ...route.query, new: undefined } })
  }
})

// --- payment dialog state ---------------------------------------------------
const payDialog = reactive<{
  open: boolean
  prefill: { fromMemberId: string; toMemberId: string; amount: string } | null
}>({
  open: false,
  prefill: null,
})

function openRecordPayment(prefill?: { fromMemberId: string; toMemberId: string; amount: string }) {
  payDialog.prefill = prefill ?? null
  payDialog.open = true
}
function closePayDialog() {
  payDialog.open = false
}

async function onSaved() {
  await refresh()
}

async function deleteBill(bill: Bill) {
  if (!confirm(t('bills.confirmDelete', { description: bill.description }))) return
  try {
    await useApi(`/api/bills/${bill.id}`, { method: 'DELETE' })
    await refresh()
  } catch (e) {
    toast({
      title: e instanceof ApiErrorThrown ? t(`errors.${e.code}` as 'errors.INTERNAL') : t('errors.INTERNAL'),
      color: 'error',
    })
  }
}

async function undoSettlement(s: Settlement) {
  if (!confirm(t('settlements.confirmDelete'))) return
  try {
    await useApi(`/api/settlements/${s.id}`, { method: 'DELETE' })
    await refresh()
    toast({ title: t('settlements.deletedToast'), color: 'success' })
  } catch (e) {
    toast({
      title: e instanceof ApiErrorThrown ? t(`errors.${e.code}` as 'errors.INTERNAL') : t('errors.INTERNAL'),
      color: 'error',
    })
  }
}

// --- bill category icons ---------------------------------------------------
const categoryIcons = [
  { test: /coffee|cafe|cà phê|trà/i, icon: 'local_cafe' },
  { test: /lunch|dinner|food|nhậu|cơm|ăn|breakfast/i, icon: 'restaurant' },
  { test: /uber|grab|taxi|flight|airport|train/i, icon: 'flight' },
  { test: /hotel|airbnb|stay|lodging|room/i, icon: 'hotel' },
  { test: /grocer|market|chợ|supermarket/i, icon: 'shopping_cart' },
  { test: /electric|power|gas|bill|internet|wifi|water/i, icon: 'bolt' },
  { test: /print|office|supplies/i, icon: 'print' },
  { test: /movie|cinema|game|fun|party/i, icon: 'celebration' },
]
function iconForBill(description: string): string {
  for (const c of categoryIcons) {
    if (c.test.test(description)) return c.icon
  }
  return 'receipt_long'
}
</script>

<template>
  <div v-if="team && ledger" class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-8 enter">
    <!-- ============ Header ============ -->
    <header class="space-y-4">
      <nav class="flex items-center gap-2 text-[var(--md-on-surface-variant)] font-label-sm">
        <NuxtLink to="/app/groups" class="hover:text-[var(--md-primary)] transition-colors">
          {{ t('teams.groupOf') }}
        </NuxtLink>
        <MIcon name="chevron_right" :size="16" />
        <span class="text-[var(--md-primary)] font-semibold">{{ team.name }}</span>
      </nav>

      <div class="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div class="space-y-1.5 min-w-0">
          <h1 class="font-headline-lg text-[var(--md-on-surface)] truncate">{{ team.name }}</h1>
          <p class="font-body-md text-[var(--md-on-surface-variant)] flex items-center gap-2 flex-wrap">
            <span class="font-mono">{{ team.defaultCurrency }}</span>
            <span class="text-[var(--md-outline)]">·</span>
            <span>{{ team.timezone }}</span>
            <span
              v-if="isOwner"
              class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--md-primary-container)]/15 text-[var(--md-primary)] text-xs font-label-md"
            >
              <MIcon name="shield" :size="14" />
              {{ t('teams.youAreOwner') }}
            </span>
          </p>
        </div>
        <div class="flex gap-3 shrink-0">
          <BButton variant="outlined" size="lg" pill icon="payments" @click="openRecordPayment()">
            {{ t('teams.settleUpAction') }}
          </BButton>
          <BButton size="lg" pill icon="add" @click="openNewBill">
            {{ t('teams.addExpense') }}
          </BButton>
        </div>
      </div>
    </header>

    <TeamNav :team-id="team.id" />

    <!-- ============ Bento: Balances + Spend hero | Expenses ============ -->
    <div class="grid grid-cols-1 md:grid-cols-12 gap-6">
      <!-- Balances + Spend (4 cols) -->
      <aside class="md:col-span-4 space-y-6">
        <!-- Balances card -->
        <section
          class="bg-[var(--md-surface-container-lowest)] p-6 rounded-2xl shadow-[var(--shadow-card)]
                 border border-[var(--md-outline-variant)]/60"
        >
          <h2 class="font-label-md text-[var(--md-on-surface-variant)] uppercase tracking-wider mb-4">
            {{ t('teams.groupBalances') }}
          </h2>

          <ul v-if="balanceRows.length" class="space-y-4">
            <li
              v-for="row in balanceRows"
              :key="row.member.id"
              class="flex items-center justify-between gap-3"
            >
              <div class="flex items-center gap-3 min-w-0">
                <BAvatar :name="row.member.displayName" :size="40" />
                <div class="min-w-0">
                  <p class="font-label-md text-[var(--md-on-surface)] truncate">{{ row.member.displayName }}</p>
                  <p
                    class="font-label-sm truncate"
                    :class="row.flavor === 'owes-you'
                      ? 'text-[var(--md-primary)] font-bold'
                      : row.flavor === 'you-owe'
                        ? 'text-[var(--md-error)] font-bold'
                        : 'text-[var(--md-on-surface-variant)]'"
                  >
                    <template v-if="row.flavor === 'owes-you'">
                      {{ t('teams.owesYou', { amount: money?.format((row.balance < 0n ? -row.balance : row.balance), 'compact') }) }}
                    </template>
                    <template v-else-if="row.flavor === 'you-owe'">
                      {{ t('teams.youOweName', { amount: money?.format((row.balance < 0n ? -row.balance : row.balance), 'compact') }) }}
                    </template>
                    <template v-else>
                      {{ t('teams.settledUp') }}
                    </template>
                  </p>
                </div>
              </div>
              <button
                v-if="row.flavor === 'you-owe' && member"
                type="button"
                class="text-[var(--md-primary)] font-label-sm font-bold hover:underline"
                @click="openRecordPayment({
                  fromMemberId: member.id,
                  toMemberId: row.member.id,
                  amount: (row.balance < 0n ? -row.balance : row.balance).toString(),
                })"
              >
                Pay
              </button>
              <MIcon
                v-else-if="row.flavor === 'owes-you'"
                name="arrow_forward_ios"
                :size="14"
                class="text-[var(--md-primary)]"
              />
              <MIcon
                v-else
                name="check_circle"
                :size="16"
                class="text-[var(--md-on-surface-variant)]"
              />
            </li>
          </ul>
          <p v-else class="text-sm text-[var(--md-on-surface-variant)]">
            Just you so far — invite teammates from the Members tab.
          </p>

          <div class="mt-6 pt-6 border-t border-[var(--md-outline-variant)]/40">
            <p class="font-label-sm text-[var(--md-on-surface-variant)] mb-1">
              {{ t('teams.yourTotalBalance') }}
            </p>
            <p
              class="font-headline-md amount"
              :class="myBalance > 0n
                ? 'text-[var(--md-tertiary)]'
                : myBalance < 0n
                  ? 'text-[var(--md-error)]'
                  : 'text-[var(--md-on-surface)]'"
            >
              {{ money?.format(myBalance) ?? '—' }}
            </p>
          </div>
        </section>

        <!-- Total Group Spend — hero primary -->
        <section
          class="relative overflow-hidden rounded-2xl p-6 hero-primary"
        >
          <div class="absolute -bottom-8 -right-8 size-32 bg-white/10 rounded-full blur-2xl" aria-hidden="true" />
          <div class="relative z-10 space-y-3">
            <p class="kicker">{{ t('teams.totalSpend') }}</p>
            <p class="font-display-lg amount">{{ money?.format(totalSpent) ?? '—' }}</p>
            <div class="inline-flex items-center gap-1.5 bg-white/20 px-3 py-1 rounded-full font-label-sm">
              <MIcon name="receipt_long" :size="14" />
              {{ ledger.view.totals.billCount }} {{ ledger.view.totals.billCount === 1 ? 'bill' : 'bills' }}
            </div>
          </div>
        </section>
      </aside>

      <!-- Expenses (8 cols) -->
      <section
        class="md:col-span-8 rounded-2xl shadow-[var(--shadow-card)] border border-[var(--md-outline-variant)]/60
               bg-[var(--md-surface-container-lowest)] overflow-hidden"
      >
        <div
          class="px-6 py-5 border-b border-[var(--md-outline-variant)]/40 flex justify-between items-center"
        >
          <h2 class="font-headline-md text-[var(--md-on-surface)]">{{ t('bills.title') }}</h2>
          <button
            type="button"
            class="inline-flex items-center gap-2 text-[var(--md-on-surface-variant)] hover:text-[var(--md-primary)] transition-colors"
          >
            <MIcon name="filter_list" :size="20" />
            <span class="font-label-md">{{ t('bills.filter') }}</span>
          </button>
        </div>

        <div v-if="ledger.bills.length" class="divide-y divide-[var(--md-outline-variant)]/30">
          <div
            v-for="b in ledger.bills"
            :key="b.id"
            class="px-6 py-5 flex items-center gap-4 hover:bg-[var(--md-surface-container-low)] transition-colors group"
          >
            <span
              class="size-12 rounded-xl inline-flex items-center justify-center shrink-0
                     bg-[var(--md-surface-container-high)] text-[var(--md-primary)]
                     group-hover:bg-[var(--md-primary-container)]/20 transition-colors"
            >
              <MIcon :name="iconForBill(b.description)" :size="22" />
            </span>
            <div class="flex-1 min-w-0">
              <div class="flex items-start justify-between gap-3 mb-1">
                <h4 class="font-label-md text-[var(--md-on-surface)] truncate">{{ b.description }}</h4>
                <p class="font-bold text-[var(--md-on-surface)] amount shrink-0">
                  {{ money?.format(b.totalAmount, 'compact') }}
                </p>
              </div>
              <div class="flex items-center justify-between gap-3 text-label-sm text-[var(--md-on-surface-variant)]">
                <p class="truncate">
                  Paid by <span class="font-bold text-[var(--md-on-surface)]">{{ memberName(b.paidByMemberId) }}</span>
                  <span class="mx-1 text-[var(--md-outline)]">·</span>
                  {{ dates?.shortDate(b.occurredOn) }}
                  <span class="mx-1 text-[var(--md-outline)]">·</span>
                  {{ b.participants.length }}p
                </p>
                <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    class="size-7 rounded-full inline-flex items-center justify-center
                           text-[var(--md-on-surface-variant)] hover:bg-[var(--md-surface-container-high)] hover:text-[var(--md-primary)]"
                    :aria-label="t('bills.editTitle')"
                    @click="openEditBill(b)"
                  >
                    <MIcon name="edit" :size="16" />
                  </button>
                  <button
                    type="button"
                    class="size-7 rounded-full inline-flex items-center justify-center
                           text-[var(--md-on-surface-variant)] hover:bg-[var(--md-error-container)]/30 hover:text-[var(--md-error)]"
                    :aria-label="'Delete'"
                    @click="deleteBill(b)"
                  >
                    <MIcon name="delete" :size="16" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          v-else
          class="px-6 py-16 text-center space-y-4"
        >
          <span class="inline-flex size-14 rounded-full bg-[var(--md-surface-container)] text-[var(--md-on-surface-variant)] items-center justify-center mx-auto">
            <MIcon name="receipt_long" :size="24" />
          </span>
          <div class="space-y-1">
            <p class="font-headline-md text-[var(--md-on-surface)]">{{ t('bills.noneTitle') }}</p>
            <p class="font-body-md text-[var(--md-on-surface-variant)] max-w-[34ch] mx-auto">
              {{ t('bills.none') }}
            </p>
          </div>
          <BButton icon="add" size="lg" class="mt-2" @click="openNewBill">
            {{ t('bills.add') }}
          </BButton>
        </div>
      </section>
    </div>

    <!-- ============ Suggested transfers ============ -->
    <section
      v-if="ledger.view.plan && ledger.view.plan.transfers.length"
      class="space-y-3"
    >
      <div class="flex items-center justify-between">
        <h2 class="font-headline-md text-[var(--md-on-surface)]">{{ t('ledger.plan.title') }}</h2>
        <button
          type="button"
          class="text-sm text-[var(--md-on-surface-variant)] hover:text-[var(--md-primary)] font-label-md inline-flex items-center gap-1"
          @click="openRecordPayment()"
        >
          <MIcon name="add" :size="16" />
          {{ t('settlements.recordOther') }}
        </button>
      </div>

      <ul
        class="rounded-2xl border border-[var(--md-outline-variant)]/60 bg-[var(--md-surface-container-lowest)]
               divide-y divide-[var(--md-outline-variant)]/30 overflow-hidden shadow-[var(--shadow-card)]"
      >
        <li
          v-for="(tr, i) in ledger.view.plan.transfers"
          :key="`${tr.fromMemberId}-${tr.toMemberId}-${i}`"
          class="p-5 flex items-center justify-between gap-4"
        >
          <div class="min-w-0 space-y-1">
            <div class="flex items-center gap-2 text-[var(--md-on-surface)]">
              <span class="font-label-md truncate">{{ memberName(tr.fromMemberId) }}</span>
              <MIcon name="arrow_forward" :size="14" class="text-[var(--md-outline)] shrink-0" />
              <span class="font-label-md truncate">{{ memberName(tr.toMemberId) }}</span>
            </div>
            <div class="font-headline-md amount text-[var(--md-primary)]">
              {{ money?.format(tr.amount) }}
            </div>
            <div
              v-if="memberPaymentInfo(tr.toMemberId)"
              class="text-xs text-[var(--md-on-surface-variant)] whitespace-pre-line font-mono pt-1"
            >
              {{ memberPaymentInfo(tr.toMemberId) }}
            </div>
          </div>
          <BButton variant="tonal" size="md" icon="check" @click="openRecordPayment(tr)">
            {{ t('settlements.recordShort') }}
          </BButton>
        </li>
      </ul>
    </section>

    <section
      v-else-if="ledger.view.plan"
      class="rounded-2xl border-2 border-dashed border-[var(--md-outline-variant)]
             bg-[var(--md-surface-container-lowest)] p-8 text-center space-y-3"
    >
      <span class="inline-flex size-12 rounded-full bg-[var(--md-tertiary)]/10 text-[var(--md-tertiary)] items-center justify-center mx-auto">
        <MIcon name="check_circle" :size="22" />
      </span>
      <p class="font-headline-md text-[var(--md-on-surface)]">{{ t('ledger.plan.none') }}</p>
      <button
        type="button"
        class="text-sm text-[var(--md-primary)] hover:underline font-label-md inline-flex items-center gap-1"
        @click="openRecordPayment()"
      >
        <MIcon name="add" :size="16" />
        {{ t('settlements.recordOther') }}
      </button>
    </section>

    <!-- ============ Settlement history ============ -->
    <section v-if="ledger.settlements.length" class="space-y-3">
      <h2 class="font-headline-md text-[var(--md-on-surface)]">{{ t('settlements.history') }}</h2>
      <ul
        class="rounded-2xl border border-[var(--md-outline-variant)]/60 bg-[var(--md-surface-container-lowest)]
               divide-y divide-[var(--md-outline-variant)]/30 overflow-hidden shadow-[var(--shadow-card)]"
      >
        <li
          v-for="s in ledger.settlements"
          :key="s.id"
          class="p-5 flex items-center justify-between gap-3"
        >
          <div class="flex items-center gap-3 min-w-0">
            <span class="size-10 rounded-xl bg-[var(--md-tertiary)]/10 text-[var(--md-tertiary)] inline-flex items-center justify-center shrink-0">
              <MIcon name="check_circle" :size="20" />
            </span>
            <div class="min-w-0">
              <p class="font-label-md text-[var(--md-on-surface)] truncate">
                <span class="font-bold">{{ memberName(s.fromMemberId) }}</span>
                paid
                <span class="font-bold">{{ memberName(s.toMemberId) }}</span>
              </p>
              <p class="font-label-sm text-[var(--md-on-surface-variant)] truncate">
                {{ dates?.shortDate(s.settledOn) }}
                <template v-if="s.note">
                  <span class="mx-1 text-[var(--md-outline)]">·</span>
                  <span class="italic">{{ s.note }}</span>
                </template>
              </p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="font-label-md amount text-[var(--md-on-surface)]">
              {{ money?.format(s.amount) }}
            </span>
            <button
              type="button"
              class="size-8 rounded-full inline-flex items-center justify-center
                     text-[var(--md-on-surface-variant)] hover:text-[var(--md-error)]
                     hover:bg-[var(--md-error-container)]/30 transition-colors"
              :aria-label="t('settlements.undo')"
              @click="undoSettlement(s)"
            >
              <MIcon name="undo" :size="18" />
            </button>
          </div>
        </li>
      </ul>
    </section>

    <!-- Mounted dialogs -->
    <BillFormDialog
      :open="billDialog.open"
      :team-id="team.id"
      :members="ledger.members"
      :currency="team.defaultCurrency"
      :timezone="team.timezone"
      :bill="billDialog.bill"
      @close="closeBillDialog"
      @saved="onSaved"
    />
    <PaymentRecordDialog
      :open="payDialog.open"
      :team-id="team.id"
      :members="ledger.members"
      :currency="team.defaultCurrency"
      :timezone="team.timezone"
      :prefill="payDialog.prefill"
      @close="closePayDialog"
      @saved="onSaved"
    />
  </div>
</template>
