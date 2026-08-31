import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import stylex from '../../../../apps/desktop/node_modules/@stylexjs/unplugin/lib/es/vite.mjs'

const prototypeRoot = fileURLToPath(new URL('.', import.meta.url))
const repositoryRoot = resolve(prototypeRoot, '../../../..')
const rendererModules = resolve(repositoryRoot, 'apps/desktop/renderer/node_modules')

export default {
  root: prototypeRoot,
  esbuild: { jsx: 'automatic' },
  plugins: [
    stylex({
      externalPackages: ['@memorilo/ui'],
      unstable_moduleResolution: { type: 'commonJS' },
      useCSSLayers: true,
    }),
  ],
  resolve: {
    alias: {
      '@memorilo/ui': resolve(repositoryRoot, 'packages/ui/src/index.ts'),
      'lucide-react': resolve(rendererModules, 'lucide-react'),
      'react-dom': resolve(rendererModules, 'react-dom'),
      'react': resolve(rendererModules, 'react'),
    },
  },
  server: {
    fs: { allow: [repositoryRoot] },
    host: '127.0.0.1',
  },
}
