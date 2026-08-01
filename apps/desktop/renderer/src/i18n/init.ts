import type { DesktopLanguage } from '@memorilo/desktop-config'
import type { Resource } from 'i18next'
import type { SupportedLanguage } from './locales'
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import {
  DEFAULT_LANGUAGE,
  FALLBACK_LANGUAGE,
  I18N_NAMESPACES,
  resolveSupportedLanguage,
} from './locales'

// Locale resources live in the repository root `locales/<namespace>/<lang>.json`,
// mirroring the layout used by Folo. Vite eagerly bundles every locale file so the
// renderer never fetches them at runtime.
const localeModules = import.meta.glob<{ default: Record<string, Record<string, unknown>> }>(
  '../../../../../locales/*/*.json',
  { eager: true },
)

function parseLocalePath(path: string): { language: string, namespace: string } {
  const segments = path.split('/')
  const language = segments.at(-1)?.replace(/\.json$/, '') ?? ''
  const namespace = segments.at(-2) ?? ''
  return { language, namespace }
}

function collectResources(): Resource {
  const resources: Record<string, Record<string, unknown>> = {}
  for (const [path, module] of Object.entries(localeModules)) {
    const { language, namespace } = parseLocalePath(path)
    resources[language] = {
      ...resources[language],
      [namespace]: module.default,
    }
  }
  return resources as Resource
}

const resources = collectResources()

export const i18n = i18next

export async function initI18n(language: string): Promise<typeof i18n> {
  const resolved = resolveSupportedLanguage(language)
  await i18next.use(initReactI18next).init({
    defaultNS: 'common',
    fallbackLng: FALLBACK_LANGUAGE,
    fallbackNS: ['common'],
    interpolation: {
      escapeValue: false,
    },
    lng: resolved,
    ns: I18N_NAMESPACES,
    resources,
    returnObjects: true,
  })
  return i18n
}

export function setI18nLanguage(language: SupportedLanguage): void {
  if (i18next.language !== language)
    void i18next.changeLanguage(language)
}

export function resolveConfigLanguage(language: DesktopLanguage): SupportedLanguage {
  if (language === 'system')
    return typeof navigator !== 'undefined' ? resolveSupportedLanguage(navigator.language) : DEFAULT_LANGUAGE
  return resolveSupportedLanguage(language)
}
