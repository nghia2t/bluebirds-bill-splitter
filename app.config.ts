// Nuxt UI 4 runtime config.
//
// The actual color values for our "ink" accent live in assets/css/main.css —
// we override --ui-primary and the --ui-color-primary-* scale directly in
// :root / .dark, which lets our cascade win over whatever Nuxt UI emits for
// the named palette below.  We still hand a real palette name here so the
// upstream theme generator doesn't choke.
export default defineAppConfig({
  ui: {
    colors: {
      primary: 'sky',
      neutral: 'slate',
    },
    icons: {
      check: 'i-lucide-check',
      close: 'i-lucide-x',
      chevronRight: 'i-lucide-chevron-right',
      loading: 'i-lucide-loader-circle',
    },
  },
})
