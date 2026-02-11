import path from 'node:path'
import process from 'node:process'
import {
  customI18nHmrPlugin,
  i18nCompleteness,
  localesJsonPlugin,
  localesPlugin,
} from '@memorilo/vite-config'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'
import { defineConfig } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import topLevelAwait from 'vite-plugin-top-level-await'
import wasm from 'vite-plugin-wasm'

const HOST = process.env.WEB_DEV_HOST ?? '0.0.0.0'
const isVisualizer = process.env.VISUALIZER === 'true'
const appSrc = path.resolve(__dirname, '../../packages/app/src')
const bundleModels = path.resolve(__dirname, '../../bundle/models')

// https://vite.dev/config/
export default defineConfig({
  publicDir: path.resolve(__dirname, '../../public'),
  clearScreen: false,
  server: {
    host: HOST,
    port: 5174,
    strictPort: true,
    fs: {
      allow: [path.resolve(__dirname, '../../packages/app'), path.resolve(__dirname, '../..')],
    },
  },
  plugins: [
    wasm(),
    topLevelAwait(),
    tailwindcss(),
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
    localesPlugin(),
    localesJsonPlugin(),
    customI18nHmrPlugin(),
    viteStaticCopy({
      targets: [
        {
          src: path.join(bundleModels, '**/*'),
          dest: 'models',
        },
      ],
    }),
    isVisualizer && visualizer({
      sourcemap: true,
    }),
  ],
  build: {
    sourcemap: isVisualizer,
  },
  worker: {
    plugins: () => [
      wasm(),
      topLevelAwait(),
    ],
  },
  resolve: {
    alias: {
      '~': appSrc,
      '@locales': path.resolve(__dirname, '../../locales'),
    },
  },
  define: {
    TAURI: false,
    I18N_COMPLETENESS_MAP: JSON.stringify({ ...i18nCompleteness, en: 100 }),
  },
})
