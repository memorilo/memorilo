import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

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
  server: {
    host: '127.0.0.1',
  },
})
