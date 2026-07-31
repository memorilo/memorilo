import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  optimizeDeps: {
    include: ['prosekit/extensions/drop-indicator', 'prosekit/pm/commands', 'prosekit/pm/view'],
  },
  plugins: [
    wasm(),
    react({
      babel: {
        plugins: [[
          '@stylexjs/babel-plugin',
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
      testerHtmlPath: './test/browser/index.html',
      viewport: { width: 1280, height: 900 },
    },
    fileParallelism: false,
    setupFiles: ['./src/test/setup.ts'],
  },
})
