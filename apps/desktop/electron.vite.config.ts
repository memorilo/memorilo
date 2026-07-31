import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import stylex from '@stylexjs/unplugin/vite'
import { tanstackRouter as TanStackRouterVite } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'
import wasm from 'vite-plugin-wasm'

const desktopRoot = dirname(fileURLToPath(import.meta.url))
const stylexOptions: NonNullable<Parameters<typeof stylex>[0]> & { externalPackages: string[] } = {
  cssInjectionTarget: fileName => fileName.includes('renderer-global'),
  externalPackages: ['@memorilo/config', '@memorilo/editor'],
  unstable_moduleResolution: { type: 'commonJS' },
  useCSSLayers: true,
}

export default defineConfig({
  main: {
    root: resolve(desktopRoot, 'main'),
    build: {
      emptyOutDir: true,
      outDir: resolve(desktopRoot, 'out/main'),
      externalizeDeps: {
        exclude: ['@memorilo/editor-storage'],
        include: ['@huggingface/transformers', 'better-sqlite3', 'loro-crdt', 'sqlite-vec'],
      },
      rollupOptions: {
        input: resolve(desktopRoot, 'main/src/index.ts'),
        output: {
          entryFileNames: 'index.js',
        },
      },
    },
  },
  preload: {
    root: resolve(desktopRoot, 'preload'),
    build: {
      emptyOutDir: true,
      outDir: resolve(desktopRoot, 'out/preload'),
      externalizeDeps: false,
      rollupOptions: {
        input: resolve(desktopRoot, 'preload/src/index.ts'),
        output: {
          entryFileNames: 'index.cjs',
          format: 'cjs',
        },
      },
    },
  },
  renderer: {
    root: resolve(desktopRoot, 'renderer'),
    plugins: [
      wasm(),
      TanStackRouterVite({ target: 'react', autoCodeSplitting: true }),
      stylex(stylexOptions),
      react(),
    ],
    build: {
      emptyOutDir: true,
      outDir: resolve(desktopRoot, 'out/renderer'),
      rollupOptions: {
        input: {
          index: resolve(desktopRoot, 'renderer/index.html'),
          settings: resolve(desktopRoot, 'renderer/settings.html'),
        },
      },
    },
  },
})
