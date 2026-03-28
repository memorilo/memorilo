import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const repoRoot = path.resolve(__dirname, '../..')

export default defineConfig({
  root: path.resolve(__dirname, 'dev'),
  clearScreen: false,
  server: {
    port: 5176,
    host: '0.0.0.0',
    strictPort: true,
    fs: {
      allow: [
        repoRoot,
        path.resolve(__dirname),
      ],
    },
  },
  plugins: [
    tailwindcss(),
    react({
    }),
  ],
})
