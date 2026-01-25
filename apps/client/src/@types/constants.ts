const langs = ['en', 'zh-CN', 'ja', 'eo'] as const

export type RendererSupportedLanguages = (typeof langs)[number]
export const currentSupportedLanguages = langs as readonly RendererSupportedLanguages[]

export const ns = ['app', 'common', 'lang', 'errors', 'settings'] as const
export const defaultNS = 'app' as const

export const dayjsLocaleImportMap = {
  'en': ['en', () => import('dayjs/locale/en')],
  'zh-CN': ['zh-cn', () => import('dayjs/locale/zh-cn')],
  'ja': ['ja', () => import('dayjs/locale/ja')],
  'eo': ['eo', () => import('dayjs/locale/eo')],
}
