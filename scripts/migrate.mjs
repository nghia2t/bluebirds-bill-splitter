import 'dotenv/config'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

const url = process.env.NUXT_DATABASE_URL ?? process.env.DATABASE_URL
if (!url) {
  console.error('NUXT_DATABASE_URL is not set')
  process.exit(1)
}

const client = postgres(url, { max: 1, prepare: false })
const db = drizzle(client)

try {
  console.log('applying migrations from server/db/migrations …')
  await migrate(db, { migrationsFolder: './server/db/migrations' })
  console.log('done')
} catch (err) {
  console.error('migration failed:')
  console.error(err)
  process.exit(1)
} finally {
  await client.end()
}
