import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import stylex from '@stylexjs/unplugin/vite'
import { tanstackRouter as TanStackRouterVite } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import wasm from 'vite-plugin-wasm'

const desktopRoot = dirname(fileURLToPath(import.meta.url))
const rendererRoot = resolve(desktopRoot, 'renderer')
const repositoryRoot = resolve(desktopRoot, '../..')

const stylexOptions: NonNullable<Parameters<typeof stylex>[0]> & { externalPackages: string[] } = {
  cssInjectionTarget: fileName => fileName.includes('renderer-global'),
  externalPackages: ['@memorilo/config', '@memorilo/editor'],
  unstable_moduleResolution: { type: 'commonJS' },
  useCSSLayers: true,
}

// Standalone renderer dev server used by the i18n hot-reload e2e test. It mirrors the
// renderer plugins from `electron.vite.config.ts` and broadens `server.fs.allow` so the
// repository-root `locales/` directory is served (and watched for HMR).
export default defineConfig({
  root: rendererRoot,
  define: {
    // Used only by the renderer HMR handler to re-read locale files in development.
    __MEMORILO_REPO_ROOT__: JSON.stringify(repositoryRoot),
  },
  plugins: [
    wasm(),
    TanStackRouterVite({ target: 'react', autoCodeSplitting: true }),
    stylex(stylexOptions),
    react(),
  ],
  server: {
    fs: {
      allow: [repositoryRoot],
    },
    host: '127.0.0.1',
    port: 5199,
    strictPort: true,
  },
  build: {
    outDir: resolve(desktopRoot, 'out/renderer-dev'),
  },
  publicDir: false,
})
