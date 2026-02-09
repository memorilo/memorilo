import type { RendererSupportedLanguages } from './@types/constants'
import log from '@memorilo/api/log'
import { memorilo } from '@memorilo/core'
import { Chain } from '@memorilo/utils/chain'
import { DEV } from '@memorilo/utils/constants'
import { EventBus } from '@memorilo/utils/event-bus'
import { jotaiStore } from '@memorilo/utils/jotai'
import { getStorageNS } from '@memorilo/utils/ns'
import { Either, Option } from 'effect'
import i18next from 'i18next'
import { atom } from 'jotai'
import { initReactI18next } from 'react-i18next'
import { defaultNS, ns } from './@types/constants'
import { defaultResources } from './@types/default-resource'

export const i18nAtom = atom(i18next)

export function getI18n() {
  return jotaiStore.get(i18nAtom)
}

export const langChain = new Chain()

export class LocaleCache {
  static shared: LocaleCache
  private getKey(lang: string) {
    return getStorageNS(`locale-${lang}`)
  }

  get(lang: string) {
    const key = this.getKey(lang)
    const cache = localStorage.getItem(key)
    if (!cache)
      return null
    return JSON.parse(cache)
  }

  set(lang: string) {
    const key = this.getKey(lang)
    const mergedResources = {} as any
    for (const nsKey of ns) {
      const nsResources = i18next.getResourceBundle(lang, nsKey)
      mergedResources[nsKey] = nsResources
    }
    localStorage.setItem(key, JSON.stringify(mergedResources))
  }
}

LocaleCache.shared = new LocaleCache()

export const fallbackLanguage = 'en'

export async function initI18n() {
  const i18next = getI18n()

  const lang = memorilo.settings.get<string>('core::lang').pipe(
    Either.getOrElse(() => Option.some(fallbackLanguage)),
  ).pipe(
    Option.map(lang => lang === '_auto' ? navigator.language : lang),
    Option.getOrElse(() => fallbackLanguage),
  )

  const mergedResources = {
    ...defaultResources,
  }

  let cache = null as any

  if (!DEV) {
    cache = LocaleCache.shared.get(lang)
    if (cache) {
      mergedResources[lang as RendererSupportedLanguages] = cache
    }
  }

  const lng = cache ? lang : fallbackLanguage
  log.info(`init i18n with lang: ${lng}`)
  await i18next.use(initReactI18next).init({
    ns,
    lng,
    fallbackLng: {
      'default': [fallbackLanguage],
      'zh-TW': ['zh-CN', fallbackLanguage],
    },
    defaultNS,
    debug: DEV,
    resources: mergedResources,
  })
}

if (import.meta.hot) {
  import.meta.hot.on(
    'i18n-update',
    async ({ file, content }: { file: string, content: string }) => {
      const resources = JSON.parse(content)
      const i18next = getI18n()

      const nsName = file.match(/locales\/(.+?)\//)?.[1]

      if (!nsName)
        return
      const lang = file.split('/').pop()?.replace('.json', '')
      if (!lang)
        return
      i18next.addResourceBundle(lang, nsName, resources, true, true)

      log.info(`reload ${lang} ${nsName}`)
      await i18next.reloadResources(lang, nsName)

      EventBus.emit('I18N_UPDATE', '')
    },
  )
}
