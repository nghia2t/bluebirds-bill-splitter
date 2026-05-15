import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

// Loaded by drizzle-kit (CLI). Runtime DB access goes through server/db/client.ts
// which reads from useRuntimeConfig(). The dotenv import above gives the CLI
// the same NUXT_DATABASE_URL that Nuxt resolves automatically at runtime.
export default defineConfig({
  schema: './server/db/schema.ts',
  out: './server/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.NUXT_DATABASE_URL ?? process.env.DATABASE_URL ?? '',
  },
  strict: true,
  verbose: true,
})
