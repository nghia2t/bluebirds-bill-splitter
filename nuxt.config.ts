// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  modules: [
    '@nuxt/ui',
    '@nuxtjs/i18n',
    'nuxt-auth-utils',
  ],

  css: ['~/assets/css/main.css'],

  // Runtime config — populated from NUXT_* env vars in prod, .env in dev.
  // Public is shipped to the browser; non-public stays server-only.
  runtimeConfig: {
    databaseUrl: process.env.DATABASE_URL,                    // NUXT_DATABASE_URL
    oauth: {
      google: {
        clientId: '',                   // NUXT_OAUTH_GOOGLE_CLIENT_ID
        clientSecret: '',               // NUXT_OAUTH_GOOGLE_CLIENT_SECRET
      },
    },
    session: {
      password: '',                     // NUXT_SESSION_PASSWORD (≥32 chars)
    },
    public: {
      baseUrl: 'http://localhost:3000', // NUXT_PUBLIC_BASE_URL
    },
  },

  i18n: {
    strategy: 'no_prefix',
    defaultLocale: 'en',
    locales: [
      { code: 'en', name: 'English',     file: 'en.json' },
      { code: 'vi', name: 'Tiếng Việt', file: 'vi.json' },
    ],
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'i18n_locale',
      // `'no prefix'` (vs `'root'`) lets the cookie drive locale detection on
      // every route — without this, refreshing /app/* skips detection and
      // falls back to `defaultLocale`, dropping the user's VI/EN choice.
      redirectOn: 'no prefix',
      fallbackLocale: 'en',
      alwaysRedirect: false,
    },
  },

  // Don't auto-import everything from server/services into Nitro auto-imports;
  // we want explicit imports there for clarity in the single-chokepoint design.
  //
  // Deploy target: Vercel.  When `vercel build` runs the `VERCEL` env var is set,
  // and Nitro auto-detects the preset; we also pin it explicitly so `pnpm build`
  // locally produces a Vercel-shaped bundle in `.vercel/output/`.  Override with
  // `NITRO_PRESET=node-server` (or similar) for non-Vercel hosts.
  nitro: {
    preset: process.env.NITRO_PRESET || (process.env.VERCEL ? 'vercel' : undefined),
    experimental: { tasks: false },
    esbuild: { options: { target: 'es2022' } },
  },

  // Vite (client) target needs to allow bigint literals (`0n`, `1n`, …) used
  // in useMoney.ts.  All browsers we target (per compatibilityDate 2025-07-15)
  // have bigint since 2020.
  vite: {
    esbuild: { target: 'es2022' },
    build: { target: 'es2022' },
  },
})
