import type { i18n as I18nInstance } from 'i18next'
import commonEn from '../../../../locales/common/en.json'
import editorEn from '../../../../locales/editor/en.json'
import learningEn from '../../../../locales/learning/en.json'

let initialized = false

export async function initEditorSurfaceI18n(i18n: I18nInstance): Promise<void> {
  if (initialized)
    return
  await i18n.init({
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    lng: 'en',
    ns: ['common', 'editor', 'learning'],
    resources: {
      en: {
        common: commonEn,
        editor: editorEn,
        learning: learningEn,
      },
    },
  })
  initialized = true
}
