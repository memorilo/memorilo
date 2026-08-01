import type { SupportedLanguage } from './locales'
import dayjs from 'dayjs'
import localizedFormat from 'dayjs/plugin/localizedFormat'

dayjs.extend(localizedFormat)

// Map our supported languages to dayjs locale codes, mirroring how Folo keeps
// dayjs's active locale in sync with the app language so locale-aware format
// tokens (`ll`, `lll`, ...) follow the UI language rather than the system locale.
const DAYJS_LOCALE_BY_LANGUAGE: Partial<Record<SupportedLanguage, string>> = {
  en: 'en',
  zh: 'zh-cn',
}

// Importing a dayjs locale registers it globally (side effect); `en` is the
// built-in default but is loaded explicitly to keep behaviour unambiguous.
const DAYJS_LOCALE_IMPORTS: Record<string, () => Promise<unknown>> = {
  'en': () => import('dayjs/locale/en'),
  'zh-cn': () => import('dayjs/locale/zh-cn'),
}

/**
 * Switches dayjs's active locale so date/time formatting follows the selected app
 * language. Locale modules are imported lazily per language so Vite can split them
 * into chunks, exactly like Folo's `dayjsLocaleImportMap`.
 */
export async function applyDayjsLocale(language: SupportedLanguage): Promise<void> {
  const locale = DAYJS_LOCALE_BY_LANGUAGE[language]
  if (!locale || locale === dayjs.locale())
    return
  const loader = DAYJS_LOCALE_IMPORTS[locale]
  if (loader)
    await loader()
  dayjs.locale(locale)
}
