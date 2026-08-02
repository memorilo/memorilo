import stylexBabelPlugin from '@stylexjs/babel-plugin'
import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  optimizeDeps: {
    include: ['@stylexjs/stylex/lib/stylex-inject'],
  },
  plugins: [
    wasm(),
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
      api: { port: 63316, strictPort: true },
      enabled: true,
      headless: true,
      instances: [{ browser: 'chromium', launch: { channel: 'chrome' } }],
      provider: 'playwright',
      viewport: { height: 276, width: 540 },
    },
    setupFiles: ['./src/test/setup.ts'],
  },
})
