import { defineConfig } from '@playwright/test'

export default defineConfig({
  fullyParallel: false,
  outputDir: '../../output/playwright/sync-server',
  retries: 0,
  testDir: './e2e',
  timeout: 60_000,
  use: {
    // The management console is a standalone browser application; keep its
    // E2E boundary independent from the Electron desktop client tests.
    browserName: 'chromium',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  workers: 1,
})
