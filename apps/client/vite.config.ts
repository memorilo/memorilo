import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { customI18nHmrPlugin } from './plugins/i18n-hmr'
import { localesPlugin } from './plugins/locales'
import { localesJsonPlugin } from './plugins/locales-json'
import i18nCompleteness from './plugins/utils/i18n-completeness'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
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
  ],
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
