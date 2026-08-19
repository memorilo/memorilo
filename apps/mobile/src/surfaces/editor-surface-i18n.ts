import type { SupportedLanguage } from '@memorilo/config'
import type { i18n as I18nInstance } from 'i18next'
import commonEn from '../../../../locales/common/en.json'
import commonZh from '../../../../locales/common/zh.json'
import editorEn from '../../../../locales/editor/en.json'
import editorZh from '../../../../locales/editor/zh.json'
import learningEn from '../../../../locales/learning/en.json'
import learningZh from '../../../../locales/learning/zh.json'

export async function initEditorSurfaceI18n(i18n: I18nInstance, language: SupportedLanguage): Promise<void> {
  if (!i18n.isInitialized) {
    await i18n.init({
      fallbackLng: 'en',
      // DOM surfaces only use bundled resources. Synchronous initialization
      // avoids waiting on an async backend that does not exist in Expo DOM.
      initImmediate: false,
      interpolation: { escapeValue: false },
      lng: language,
      ns: ['common', 'editor', 'learning'],
      resources: {
        en: {
          common: commonEn,
          editor: editorEn,
          learning: learningEn,
        },
        zh: {
          common: commonZh,
          editor: editorZh,
          learning: learningZh,
        },
      },
    })
  }
  if (i18n.language !== language)
    await i18n.changeLanguage(language)
}
