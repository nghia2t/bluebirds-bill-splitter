<script setup lang="ts">
// Lightweight avatar: image when `src` resolves, otherwise an initial monogram
// on a primary-container tint.  Matches the avatar rhythm used everywhere in
// the design (member balances, expense rows, dialog participant cards).

const props = withDefaults(defineProps<{
  src?: string | null
  name?: string | null
  size?: number
  ring?: boolean
}>(), {
  size: 40,
  ring: false,
})

const sizePx = computed(() => `${props.size}px`)
const fontPx = computed(() => `${Math.max(12, Math.round(props.size * 0.4))}px`)
const initial = computed(() => (props.name?.trim()?.[0] ?? '?').toUpperCase())
const failed = ref(false)
</script>

<template>
  <span
    class="inline-flex items-center justify-center rounded-full overflow-hidden shrink-0
           bg-[var(--md-primary-container)]/15 text-[var(--md-primary)] font-semibold"
    :class="ring ? 'ring-2 ring-[var(--md-primary-container)] ring-offset-2 ring-offset-[var(--md-surface-container-lowest)]' : ''"
    :style="{ width: sizePx, height: sizePx, fontSize: fontPx }"
    :aria-label="name ?? undefined"
  >
    <img
      v-if="src && !failed"
      :src="src"
      :alt="name ?? ''"
      class="w-full h-full object-cover"
      referrerpolicy="no-referrer"
      crossorigin="anonymous"
      loading="lazy"
      decoding="async"
      @error="failed = true"
    />
    <span v-else aria-hidden="true">{{ initial }}</span>
  </span>
</template>
