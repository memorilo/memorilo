export const SUPPORTED_LANGUAGES = ['en', 'zh'] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

export const DEFAULT_LANGUAGE: SupportedLanguage = 'en'
export const FALLBACK_LANGUAGE = DEFAULT_LANGUAGE

export const I18N_NAMESPACES = [
  'common',
  'app',
  'pages',
  'editor',
  'learning',
  'todo',
  'panel',
  'settings',
] as const

export type I18NNamespace = (typeof I18N_NAMESPACES)[number]

export interface LocaleMetadata {
  code: SupportedLanguage
  displayName: string
}

export const LOCALES: readonly LocaleMetadata[] = [
  { code: 'en', displayName: 'English' },
  { code: 'zh', displayName: '简体中文' },
]

export function isSupportedLanguage(value: string): value is SupportedLanguage {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(value)
}

export function resolveSupportedLanguage(language: string): SupportedLanguage {
  const normalized = language.toLocaleLowerCase()
  for (const supported of SUPPORTED_LANGUAGES) {
    if (normalized === supported)
      return supported
    if (normalized.startsWith(`${supported}-`))
      return supported
  }
  return DEFAULT_LANGUAGE
}
