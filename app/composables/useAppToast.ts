// Toast queue used everywhere outside the legacy U* pages.
//
// We deliberately ship our own instead of relying on @nuxt/ui's `useToast`,
// because the new layout doesn't wrap the tree in `<UApp>` (and adding that
// back would also drag in the U* toaster styles we worked hard to drop).
//
// Backed by a single global `useState` ref so every component sees the same
// queue without a provide/inject dance.  The layout mounts <AppToast /> once
// and renders the list.

export type ToastColor = 'success' | 'error' | 'warning' | 'info' | 'neutral'

export interface ToastItem {
  id: number
  title: string
  description?: string
  color?: ToastColor
  /** auto-dismiss in ms; defaults to 3500.  Pass 0 to disable auto-dismiss. */
  timeout?: number
}

let _seq = 0

export function useAppToast() {
  const toasts = useState<ToastItem[]>('bb-toasts', () => [])

  function add(input: Omit<ToastItem, 'id'>) {
    const id = ++_seq
    const t: ToastItem = { color: 'neutral', timeout: 3500, ...input, id }
    toasts.value = [...toasts.value, t]
    if (t.timeout && t.timeout > 0 && import.meta.client) {
      window.setTimeout(() => remove(id), t.timeout)
    }
    return id
  }

  function remove(id: number) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  return { toasts, add, remove }
}
