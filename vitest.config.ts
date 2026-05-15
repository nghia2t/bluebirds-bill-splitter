import { defineConfig } from 'vitest/config'

// Foundation tests are pure (no Nuxt, no DB). When integration tests arrive that
// need the Nuxt server context, we'll add a second project entry using
// `@nuxt/test-utils/config`. Keeping unit tests fast and unentangled is worth
// the small config split.
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    globals: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'server/services/**/*.ts',
        'shared/**/*.ts',
        'server/utils/**/*.ts',
      ],
    },
  },
})
