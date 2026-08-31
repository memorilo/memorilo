import { resolve } from 'node:path'
import stylex from '@stylexjs/unplugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  root: resolve(import.meta.dirname),
  plugins: [stylex({ unstable_moduleResolution: { type: 'commonJS' }, useCSSLayers: true }), react()],
  build: {
    emptyOutDir: true,
    outDir: '../dist-ssr',
    rollupOptions: { output: { entryFileNames: 'server.js' } },
    ssr: resolve(import.meta.dirname, 'src/server.tsx'),
  },
})
