<script setup lang="ts">
// Toast viewport.  Mounted once by the default layout.  Reads the global
// queue from `useAppToast()` and renders fixed bottom-right (above the
// mobile bottom-nav).  Colors map onto the MD3 palette.
import { useAppToast, type ToastColor } from '~/composables/useAppToast'

const { toasts, remove } = useAppToast()

const colorClasses: Record<ToastColor, string> = {
  success: 'bg-[var(--md-tertiary)] text-white',
  error:   'bg-[var(--md-error)] text-[var(--md-on-error)]',
  warning: 'bg-[#ffb74d] text-[#3a2200]',
  info:    'bg-[var(--md-primary-container)] text-[var(--md-on-primary-container)]',
  neutral: 'bg-[var(--md-inverse-surface)] text-[var(--md-inverse-on-surface)]',
}

const colorIcon: Record<ToastColor, string> = {
  success: 'check_circle',
  error:   'error',
  warning: 'warning',
  info:    'info',
  neutral: 'notifications',
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed z-[60] bottom-24 sm:bottom-6 right-4 sm:right-6
             flex flex-col gap-2 max-w-[calc(100vw-2rem)] sm:max-w-sm pointer-events-none"
    >
      <TransitionGroup
        enter-active-class="transition-all duration-200 ease-out"
        enter-from-class="opacity-0 translate-y-2"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition-all duration-150 ease-in"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0 translate-x-4"
      >
        <div
          v-for="t in toasts"
          :key="t.id"
          class="pointer-events-auto rounded-xl px-4 py-3 shadow-[var(--shadow-card-lifted)]
                 flex items-start gap-3 min-w-[18rem]"
          :class="colorClasses[t.color ?? 'neutral']"
          role="status"
        >
          <MIcon :name="colorIcon[t.color ?? 'neutral']" :size="20" class="mt-0.5 shrink-0" />
          <div class="flex-1 min-w-0">
            <p class="font-label-md text-sm leading-tight">{{ t.title }}</p>
            <p v-if="t.description" class="text-xs opacity-85 mt-1 leading-snug">
              {{ t.description }}
            </p>
          </div>
          <button
            type="button"
            class="shrink-0 -mr-1 opacity-80 hover:opacity-100 transition-opacity"
            aria-label="Dismiss"
            @click="remove(t.id)"
          >
            <MIcon name="close" :size="18" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>
