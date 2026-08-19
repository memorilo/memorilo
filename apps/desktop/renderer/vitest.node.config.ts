import stylexBabelPlugin from '@stylexjs/babel-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
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
    include: ['src/**/*.node.test.ts'],
  },
})
