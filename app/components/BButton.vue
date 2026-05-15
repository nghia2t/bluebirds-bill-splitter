<script setup lang="ts">
// Custom button primitive used everywhere we used to use `<UButton>`.
//
// Variants mirror the design system:
//   filled     — primary call-to-action (solid teal-blue).
//   tonal      — secondary action (primary-container tint).
//   outlined   — secondary outline.
//   ghost      — quiet, used in toolbars and table rows.
//   danger     — destructive.
//
// Sizes:
//   sm | md | lg | xl
//
// Either renders an `<button>` or a `<NuxtLink>` when `to` is provided.

type Variant = 'filled' | 'tonal' | 'outlined' | 'ghost' | 'danger' | 'inverted'
type Size = 'sm' | 'md' | 'lg' | 'xl'

const props = withDefaults(defineProps<{
  to?: string
  href?: string
  type?: 'button' | 'submit' | 'reset'
  variant?: Variant
  size?: Size
  icon?: string
  trailingIcon?: string
  iconFilled?: boolean
  block?: boolean
  loading?: boolean
  disabled?: boolean
  pill?: boolean
  ariaLabel?: string
}>(), {
  type: 'button',
  variant: 'filled',
  size: 'md',
  block: false,
  loading: false,
  disabled: false,
  pill: false,
  iconFilled: false,
})

const variantClasses: Record<Variant, string> = {
  filled:
    'bg-[var(--md-primary)] text-[var(--md-on-primary)] shadow-[var(--shadow-card)] '
    + 'hover:shadow-[var(--shadow-card-lifted)] hover:brightness-110 active:scale-[0.98] disabled:opacity-50',
  tonal:
    'bg-[var(--md-primary-container)]/15 text-[var(--md-primary)] '
    + 'hover:bg-[var(--md-primary-container)]/25 active:scale-[0.98] disabled:opacity-50',
  outlined:
    'border border-[var(--md-primary)] text-[var(--md-primary)] bg-transparent '
    + 'hover:bg-[var(--md-primary)]/5 active:scale-[0.98] disabled:opacity-50',
  ghost:
    'text-[var(--md-on-surface-variant)] bg-transparent '
    + 'hover:bg-[var(--md-surface-container-high)] hover:text-[var(--md-on-surface)] '
    + 'active:scale-[0.98] disabled:opacity-50',
  danger:
    'bg-[var(--md-error)] text-[var(--md-on-error)] shadow-[var(--shadow-card)] '
    + 'hover:brightness-110 active:scale-[0.98] disabled:opacity-50',
  inverted:
    'bg-white text-[var(--md-primary)] shadow-[var(--shadow-card)] '
    + 'hover:shadow-[var(--shadow-card-lifted)] active:scale-[0.98] disabled:opacity-50',
}

const sizeClasses: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-11 px-5 text-sm gap-2',
  xl: 'h-12 px-6 text-base gap-2.5',
}

const iconSize: Record<Size, number> = { sm: 16, md: 18, lg: 20, xl: 22 }

const baseClasses = computed(() => [
  'inline-flex items-center justify-center font-label-md font-semibold',
  'transition-all duration-150 ease-out',
  'disabled:cursor-not-allowed',
  'select-none',
  props.pill ? 'rounded-full' : 'rounded-xl',
  props.block ? 'w-full' : '',
  sizeClasses[props.size],
  variantClasses[props.variant],
].filter(Boolean).join(' '))

const isDisabled = computed(() => props.disabled || props.loading)
</script>

<template>
  <a
    v-if="href && !isDisabled"
    :href="href"
    :class="baseClasses"
    :aria-label="ariaLabel"
  >
    <MIcon v-if="loading" name="progress_activity" :size="iconSize[size]" class="animate-spin" />
    <MIcon v-else-if="icon" :name="icon" :filled="iconFilled" :size="iconSize[size]" />
    <span v-if="$slots.default" class="leading-none"><slot /></span>
    <MIcon v-if="trailingIcon" :name="trailingIcon" :size="iconSize[size]" />
  </a>

  <NuxtLink
    v-else-if="to && !isDisabled"
    :to="to"
    :class="baseClasses"
    :aria-label="ariaLabel"
  >
    <MIcon v-if="loading" name="progress_activity" :size="iconSize[size]" class="animate-spin" />
    <MIcon v-else-if="icon" :name="icon" :filled="iconFilled" :size="iconSize[size]" />
    <span v-if="$slots.default" class="leading-none"><slot /></span>
    <MIcon v-if="trailingIcon" :name="trailingIcon" :size="iconSize[size]" />
  </NuxtLink>

  <button
    v-else
    :type="type"
    :class="baseClasses"
    :disabled="isDisabled"
    :aria-label="ariaLabel"
  >
    <MIcon v-if="loading" name="progress_activity" :size="iconSize[size]" class="animate-spin" />
    <MIcon v-else-if="icon" :name="icon" :filled="iconFilled" :size="iconSize[size]" />
    <span v-if="$slots.default" class="leading-none"><slot /></span>
    <MIcon v-if="trailingIcon" :name="trailingIcon" :size="iconSize[size]" />
  </button>
</template>
