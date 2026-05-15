// One-off diagnostic.  Connects to the dev DB and prints the actual column
// list of the `bills` table, plus the rows in __drizzle_migrations so we can
// see exactly which migrations have been applied.
//
// Run: pnpm exec node scripts/inspect-bills.mjs

import 'dotenv/config'
import postgres from 'postgres'

const url = process.env.NUXT_DATABASE_URL ?? process.env.DATABASE_URL
if (!url) {
  console.error('NUXT_DATABASE_URL is not set in .env')
  process.exit(1)
}

const sql = postgres(url, { prepare: false, max: 1 })

try {
  const cols = await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bills'
    ORDER BY ordinal_position
  `
  console.log('--- public.bills columns ---')
  if (cols.length === 0) console.log('  (table does not exist)')
  for (const c of cols) console.log(`  ${c.column_name.padEnd(20)} ${c.data_type}`)

  const settle = await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'settlements'
    ORDER BY ordinal_position
  `
  console.log('\n--- public.settlements columns ---')
  if (settle.length === 0) console.log('  (table does not exist)')
  for (const c of settle) console.log(`  ${c.column_name.padEnd(20)} ${c.data_type}`)

  const cycles = await sql`
    SELECT to_regclass('public.cycles') AS exists
  `
  console.log('\n--- public.cycles ---')
  console.log(`  ${cycles[0].exists === null ? 'dropped (good)' : 'still exists (bad)'}`)

  const migs = await sql`SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id`
  console.log('\n--- drizzle.__drizzle_migrations rows ---')
  for (const m of migs) console.log(`  ${m.hash}  ${m.created_at}`)
} finally {
  await sql.end()
}
