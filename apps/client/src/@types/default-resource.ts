import type { ns, RendererSupportedLanguages } from './constants'
import en from '@locales/app/en.json'
import common_de from '@locales/common/de.json'
import common_en from '@locales/common/en.json'
import common_zhCN from '@locales/common/zh-CN.json'
import errors_de from '@locales/errors/de.json'
import errors_en from '@locales/errors/en.json'
import lang_de from '@locales/lang/de.json'
import lang_en from '@locales/lang/en.json'
import lang_zhCN from '@locales/lang/zh-CN.json'
import settings_de from '@locales/settings/de.json'
import settings_en from '@locales/settings/en.json'

/**
 * This file is the language resource that is loaded in full when the app is initialized.
 * When switching languages, the app will automatically download the required language resources,
 * we will not load all the language resources to minimize the first screen loading time of the app.
 * Generally, we only load english resources synchronously by default.
 * In addition, we attach common resources for other languages, and the size of the common resources must be controlled.
 */
export const defaultResources = {
  'en': {
    app: en,
    lang: lang_en,
    common: common_en,
    settings: settings_en,
    errors: errors_en,
  },
  'zh-CN': {
    lang: lang_zhCN,
    common: common_zhCN,
  },
  'de': {
    lang: lang_de,
    common: common_de,
    settings: settings_de,
    errors: errors_de,
  },
} satisfies Record<
  RendererSupportedLanguages,
  Partial<Record<(typeof ns)[number], Record<string, string>>>
>
