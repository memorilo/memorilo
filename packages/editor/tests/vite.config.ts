import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const packageRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(packageRoot, '../..')

export default defineConfig({
  root: __dirname,
  clearScreen: false,
  server: {
    port: 5176,
    strictPort: true,
    fs: {
      allow: [
        repoRoot,
        packageRoot,
        __dirname,
      ],
    },
  },
  plugins: [
    tailwindcss(),
    react(),
  ],
})
