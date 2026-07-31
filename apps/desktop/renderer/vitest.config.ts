import stylexBabelPlugin from '@stylexjs/babel-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  optimizeDeps: {
    include: ['@stylexjs/stylex/lib/stylex-inject'],
  },
  plugins: [
    react({
      babel: {
        plugins: [[
          stylexBabelPlugin,
          {
            dev: true,
            runtimeInjection: true,
            unstable_moduleResolution: { type: 'commonJS' },
          },
        ]],
      },
    }),
  ],
  test: {
    browser: {
      enabled: true,
      headless: true,
      instances: [{ browser: 'chromium', launch: { channel: 'chrome' } }],
      provider: 'playwright',
      viewport: { height: 276, width: 540 },
    },
    setupFiles: ['./src/test/setup.ts'],
  },
})
