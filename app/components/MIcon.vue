<script setup lang="ts">
// Material Symbols Outlined wrapper.  The whole design system uses MS as its
// glyph set — this component is the one place we hide the boilerplate.  The
// font is loaded via Google Fonts in app/assets/css/main.css.
//
// Usage:
//   <MIcon name="dashboard" />            <!-- 20px outline -->
//   <MIcon name="check_circle" filled />  <!-- filled variant -->
//   <MIcon name="add" size="28" />        <!-- explicit px -->
//
// We deliberately don't expose every variation axis (wght/grad/opsz) — the
// design only varies fill, and adding more would just be cargo-cult.

const props = withDefaults(defineProps<{
  /** Material Symbols glyph name, e.g. `dashboard`, `receipt_long`. */
  name: string
  /** Render the FILL=1 variant. */
  filled?: boolean
  /**
   * Pixel size for both the font and the `opsz` axis.  Defaults to 24px
   * which matches the inherited body line-height for clean baseline.
   */
  size?: number | string
}>(), {
  filled: false,
  size: 24,
})

const sizePx = computed(() => typeof props.size === 'number' ? `${props.size}px` : props.size)
</script>

<template>
  <span
    class="material-symbols-outlined"
    :class="{ 'is-filled': filled }"
    :style="{ fontSize: sizePx }"
    aria-hidden="true"
  >{{ name }}</span>
</template>
