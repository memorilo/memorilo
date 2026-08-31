import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  out: './infrastructure/database/migrations',
  schema: './infrastructure/database/schema.ts',
})
