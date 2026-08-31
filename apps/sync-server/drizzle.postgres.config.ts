import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  out: './infrastructure/database/migrations-postgres',
  schema: './infrastructure/database/schema.postgres.ts',
})
