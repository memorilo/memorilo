import path from 'node:path'
import process from 'node:process'
import {
  customI18nHmrPlugin,
  i18nCompleteness,
  localesJsonPlugin,
  localesPlugin,
  spdxLicensePlugin,
} from '@memorilo/vite-config'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'
import { defineConfig } from 'vite'
import topLevelAwait from 'vite-plugin-top-level-await'
import wasm from 'vite-plugin-wasm'
import { z } from 'zod'

const HOST = process.env.TAURI_DEV_HOST ?? '0.0.0.0'
const isVisualizer = process.env.VISUALIZER === 'true'
const PLATFORM = z.enum(['web', 'android', 'ios', 'linux', 'windows', 'macos']).parse(process.env.PLATFORM)
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
    spdxLicensePlugin(),
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
    PLATFORM: JSON.stringify(PLATFORM),
    I18N_COMPLETENESS_MAP: JSON.stringify({ ...i18nCompleteness, en: 100 }),
  },
})
