import { defineConfig } from '@playwright/test'

export default defineConfig({
  fullyParallel: false,
  retries: 0,
  testDir: './tests',
  timeout: 60_000,
  workers: 1,
})
