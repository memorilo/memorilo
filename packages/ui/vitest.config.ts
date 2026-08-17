import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
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
      instances: [{ browser: 'chromium' }],
      provider: 'playwright',
      testerHtmlPath: './test/browser/index.html',
      viewport: { height: 600, width: 900 },
    },
    setupFiles: ['../../scripts/vitest-browser-setup.ts', './src/test/setup.ts'],
  },
})
