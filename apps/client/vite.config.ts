import path from 'node:path'
import process from 'node:process'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'
import { defineConfig } from 'vite'
import topLevelAwait from 'vite-plugin-top-level-await'
import wasm from 'vite-plugin-wasm'
import { customI18nHmrPlugin } from './plugins/i18n-hmr'
import { localesPlugin } from './plugins/locales'
import { localesJsonPlugin } from './plugins/locales-json'
import i18nCompleteness from './plugins/utils/i18n-completeness'

const HOST = process.env.TAURI_DEV_HOST ?? '0.0.0.0'
const isVisualizer = process.env.VISUALIZER === 'true'
const appSrc = path.resolve(__dirname, '../../packages/app/src')

// https://vite.dev/config/
export default defineConfig({
  publicDir: path.resolve(__dirname, '../../public'),
  clearScreen: false,
  server: {
    host: HOST,
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
    TAURI: true,
    I18N_COMPLETENESS_MAP: JSON.stringify({ ...i18nCompleteness, en: 100 }),
  },
})
