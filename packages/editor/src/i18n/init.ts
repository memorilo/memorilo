import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'

import commonEn from '../../../../locales/common/en.json'
import commonZh from '../../../../locales/common/zh.json'
import editorEn from '../../../../locales/editor/en.json'
import editorZh from '../../../../locales/editor/zh.json'

/**
 * Initializes i18next with the repository-root locale bundles. The desktop renderer
 * normally owns i18n initialization (its own `init.ts`), and this package rides the
 * shared global i18next instance. This helper exists so the editor package's own
 * vitest environment (which runs in isolation from the renderer) has a ready i18next
 * instance with the real English/Chinese resources — keeping existing components that
 * assert on English labels working.
 */
export async function initEditorI18nForTests(): Promise<void> {
  if (i18next.isInitialized)
    return

  await i18next.use(initReactI18next).init({
    defaultNS: 'editor',
    fallbackNS: ['common'],
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
    lng: 'en',
    react: {
      bindI18nStore: 'added',
    },
    returnObjects: true,
    resources: {
      en: {
        editor: editorEn,
        common: commonEn,
      },
      zh: {
        editor: editorZh,
        common: commonZh,
      },
    },
  })
}
