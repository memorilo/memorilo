import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const baseURL = 'http://127.0.0.1:5176'

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
  webServer: {
    command: 'pnpm exec vite --config tests/vite.config.ts --host 127.0.0.1',
    cwd: __dirname,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: baseURL,
  },
})
