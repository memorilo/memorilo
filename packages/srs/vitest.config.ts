import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      all: true,
      // Environment-specific entry points are verified by the mobile export/native
      // checks; they cannot execute in this Node-only unit-test runtime.
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts', 'src/browser.ts', 'src/portable.ts', 'src/types.ts'],
      include: ['src/**/*.ts'],
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary'],
      thresholds: {
        branches: 100,
        functions: 100,
        lines: 100,
        statements: 100,
      },
    },
  },
})
