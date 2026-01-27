import path from 'node:path'
import process from 'node:process'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
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

// https://vite.dev/config/
export default defineConfig({
  publicDir: path.resolve(__dirname, '../../public'),
  server: {
    host: HOST,
  },
  plugins: [
    wasm(),
    topLevelAwait(),
    tailwindcss(),
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }),
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
      '~': path.resolve(__dirname, 'src'),
      '@locales': path.resolve(__dirname, '../../locales'),
    },
  },
  define: {
    TAURI: true,
    I18N_COMPLETENESS_MAP: JSON.stringify({ ...i18nCompleteness, en: 100 }),
  },
})
