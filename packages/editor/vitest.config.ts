import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  optimizeDeps: {
    include: ['prosekit/pm/commands', 'prosekit/pm/view'],
  },
  plugins: [
    react({
      babel: {
        plugins: [['@stylexjs/babel-plugin', { dev: true, test: true }]],
      },
    }),
  ],
  test: {
    browser: {
      enabled: true,
      headless: true,
      instances: [{ browser: 'chromium', launch: { channel: 'chrome' } }],
      provider: 'playwright',
      testerHtmlPath: './test/browser/index.html',
      viewport: { width: 1280, height: 900 },
    },
    fileParallelism: false,
    setupFiles: ['./src/test/setup.ts'],
  },
})
