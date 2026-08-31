import type { Plugin } from 'vite'
import { resolve } from 'node:path'
import stylex from '@stylexjs/unplugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

function stylexProductionStyles(): Plugin {
  return {
    apply: 'build',
    name: 'memorilo-sync-server-stylex-link',
    transformIndexHtml: {
      order: 'post',
      handler: () => [{
        attrs: { href: '/assets/stylex.css', rel: 'stylesheet' },
        injectTo: 'head',
        tag: 'link',
      }],
    },
  }
}

export default defineConfig({
  root: resolve(import.meta.dirname),
  plugins: [stylex({ unstable_moduleResolution: { type: 'commonJS' }, useCSSLayers: true }), react(), stylexProductionStyles()],
  build: { outDir: '../dist', emptyOutDir: true },
  server: { host: '127.0.0.1', port: 5175 },
})
