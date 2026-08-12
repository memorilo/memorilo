import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  optimizeDeps: {
    include: [
      'prosekit/extensions/drop-indicator',
      'prosekit/extensions/readonly',
      'prosekit/pm/commands',
      'prosekit/pm/view',
    ],
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
      instances: [{ browser: 'chromium' }],
      provider: 'playwright',
      testerHtmlPath: './test/browser/index.html',
      viewport: { width: 1280, height: 900 },
    },
    fileParallelism: false,
    exclude: [...configDefaults.exclude, 'src/**/*.node.test.ts'],
    setupFiles: ['../../scripts/vitest-browser-setup.ts', './src/test/setup.ts'],
  },
})
