import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    fileParallelism: false,
    hookTimeout: 30_000,
    include: ['src/**/*.service.test.ts'],
    testTimeout: 30_000,
  },
})
