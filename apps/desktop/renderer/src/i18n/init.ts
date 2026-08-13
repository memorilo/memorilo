import type { DesktopLanguage } from '@memorilo/desktop-config'
import type { Resource } from 'i18next'
import type { SupportedLanguage } from './locales'
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import { applyDayjsLocale } from './date'
import {
  DEFAULT_LANGUAGE,
  FALLBACK_LANGUAGE,
  I18N_NAMESPACES,
  resolveSupportedLanguage,
} from './locales'

// Shape of the collected locale bundles: language -> namespace -> translations.
// Kept separate from i18next's own `Resource` type because `noUncheckedIndexedAccess`
// makes indexing into `Resource` produce `undefined` union members; we cast once at init.
interface TranslationsLanguage {
  [namespace: string]: Record<string, unknown>
}

interface LocaleModule {
  default: Record<string, Record<string, unknown>>
}

// Locale resources live in the repository root `locales/<namespace>/<lang>.json`,
// mirroring the layout used by Folo. Vite eagerly bundles every locale file so the
// renderer never fetches them at runtime.
const localeModules = import.meta.glob<LocaleModule>(
  '../../../../../locales/*/*.json',
  { eager: true },
)

// Injected by the renderer Vite configs for the HMR handler below, which re-reads
// locale files through their `/@fs` dev URL.
declare const __MEMORILO_REPO_ROOT__: string | undefined

function parseLocalePath(path: string): { language: string, namespace: string } {
  const segments = path.split('/')
  const language = segments.at(-1)?.replace(/\.json$/, '') ?? ''
  const namespace = segments.at(-2) ?? ''
  return { language, namespace }
}

function collectResources(
  localeModules: Record<string, LocaleModule>,
): Record<string, TranslationsLanguage> {
  const resources: Record<string, TranslationsLanguage> = {}
  for (const [path, module] of Object.entries(localeModules)) {
    const { language, namespace } = parseLocalePath(path)
    resources[language] = {
      ...resources[language],
      [namespace]: module.default,
    }
  }
  return resources
}

const resources = collectResources(localeModules)

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
    react: {
      bindI18nStore: 'added',
    },
    resources: resources as unknown as Resource,
    returnObjects: true,
  })
  await applyDayjsLocale(resolved)
  return i18n
}

let requestedLanguage: SupportedLanguage | null = null
let changingLanguage = false

async function applyRequestedLanguage(): Promise<void> {
  if (changingLanguage)
    return
  changingLanguage = true
  try {
    while (requestedLanguage) {
      const language = requestedLanguage
      requestedLanguage = null
      await applyDayjsLocale(language)
      if (requestedLanguage)
        continue
      if (i18next.language !== language)
        await i18next.changeLanguage(language)
    }
  }
  finally {
    changingLanguage = false
    if (requestedLanguage)
      void applyRequestedLanguage()
  }
}

export function setI18nLanguage(language: SupportedLanguage): void {
  requestedLanguage = language
  void applyRequestedLanguage()
}

export function resolveConfigLanguage(language: DesktopLanguage): SupportedLanguage {
  if (language === 'system')
    return typeof navigator !== 'undefined' ? resolveSupportedLanguage(navigator.language) : DEFAULT_LANGUAGE
  return resolveSupportedLanguage(language)
}

// In the Vite dev server, editing a locale <namespace>/<lang>.json file hot-reloads
// the updated resources into the running i18next instance instead of forcing a full
// page reload, so the UI reflects the new translation immediately. We re-read each
// file through its `/@fs` dev URL (which always reflects disk), merge the fresh bundle
// into the i18next store, and let the `added` store event (bound via
// `react.bindI18nStore: 'added'`) re-render every `useTranslation` component.
//
// `react.bindI18nStore: 'added'` is what makes the runtime resource updates visible: by
// default react-i18next only re-renders on `languageChanged`, but adding a bundle
// changes the translations without changing the language.
if (import.meta.hot) {
  // `import.meta.hot` is false in production builds, so this block (and the
  // `/@fs`-fetching below) is eliminated before `__MEMORILO_REPO_ROOT__` is read.
  const repositoryRoot = typeof __MEMORILO_REPO_ROOT__ === 'string'
    ? __MEMORILO_REPO_ROOT__.replaceAll('\\', '/')
    : ''
  const localeKeys = Object.keys(localeModules)

  async function hotReloadLocaleResources(): Promise<void> {
    await Promise.all(
      localeKeys.map(async (key) => {
        // `key` looks like `../../../../../locales/<ns>/<lang>.json` relative to init.ts;
        // normalize it to a repository-root-relative `locales/<ns>/<lang>.json` path.
        const fromRepositoryRoot = key.split('/').filter(segment => segment && segment !== '.' && segment !== '..').join('/')
        const absoluteLocalePath = repositoryRoot.startsWith('/')
          ? repositoryRoot
          : `/${repositoryRoot}`
        const response = await fetch(`/@fs${absoluteLocalePath}/${fromRepositoryRoot}?t=${Date.now()}`)
        if (!response.ok)
          return
        const bundle = await response.json() as Record<string, Record<string, unknown>>
        const { language, namespace } = parseLocalePath(key)
        i18next.addResourceBundle(language, namespace, bundle, true, true)
      }),
    )
  }

  import.meta.hot.on('memorilo:locale-update', () => {
    void hotReloadLocaleResources().catch(() => {
      // A subsequent locale update will retry without taking down the renderer.
    })
  })
}
