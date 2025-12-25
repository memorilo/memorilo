const langs = ['en', 'zh-CN', 'de'] as const

export const currentSupportedLanguages = langs as readonly string[]
export type RendererSupportedLanguages = (typeof langs)[number]

export const ns = ['app', 'common', 'lang', 'errors', 'settings'] as const
export const defaultNS = 'app' as const

export const dayjsLocaleImportMap = {
  'en': ['en', () => import('dayjs/locale/en')],
  'zh-CN': ['zh-cn', () => import('dayjs/locale/zh-cn')],
  'de': ['de', () => import('dayjs/locale/de')],
}
