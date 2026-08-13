import stylexBabelPlugin from '@stylexjs/babel-plugin'
import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  optimizeDeps: {
    include: [
      '@memorilo/editor > prosekit/extensions/readonly',
      '@stylexjs/stylex/lib/stylex-inject',
      '@tanstack/react-query',
      '@tanstack/react-router',
      '@tanstack/react-virtual',
      'effect-query',
    ],
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
      enabled: true,
      headless: true,
      instances: [{ browser: 'chromium' }],
      provider: 'playwright',
      viewport: { height: 276, width: 540 },
    },
    exclude: [...configDefaults.exclude, '**/*.node.test.ts'],
    setupFiles: ['../../../scripts/vitest-browser-setup.ts', './src/test/setup.ts'],
  },
})
