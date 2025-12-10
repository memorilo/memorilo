import type { RendererSupportedLanguages } from '~/@types/constants'
import { EventBus } from '@memorilo/utils/event-bus'
import { isEmptyObject } from '@memorilo/utils/utils'
import * as appLog from '@tauri-apps/plugin-log'
import dayjs from 'dayjs'

import i18next from 'i18next'
import { z } from 'zod'
import { currentSupportedLanguages, dayjsLocaleImportMap } from '~/@types/constants'
import { defaultResources } from '~/@types/default-resource'

import { langChain, LocaleCache } from '~/i18n'

const loadingLangLock = new Set<string>()
const loadedLangs = new Set<string>(['en'])

function parseLangCode(lang: string): RendererSupportedLanguages {
  return z.enum([...currentSupportedLanguages as RendererSupportedLanguages[]]).parse(lang)
}

export async function loadLanguageAndApply(newLang: string) {
  const lang = parseLangCode(newLang)
  const dayjsImport = dayjsLocaleImportMap[lang]

  if (dayjsImport) {
    const [locale, loader] = dayjsImport
    if (typeof locale !== 'string' || typeof loader !== 'function') {
      appLog.error(`dayjs locale or loader is invalid: ${lang}`)
      return
    }
    loader().then(() => {
      appLog.info(`dayjs loaded: ${locale}`)
      langChain.next(() => {
        return dayjs.locale(locale)
      })
    })
  }

  // ipcServices?.app.switchAppLocale(lang)

  if (loadingLangLock.has(lang))
    return
  const isSupport = currentSupportedLanguages.includes(lang)
  if (!isSupport) {
    return
  }
  const loaded = loadedLangs.has(lang)

  if (loaded) {
    if (import.meta.env.DEV) {
      EventBus.emit('I18N_UPDATE', '')
    }
    return
  }

  loadingLangLock.add(lang)

  if (import.meta.env.DEV) {
    appLog.info(`Loading language resources for: ${lang} in DEV mode`)
    const nsGlobbyMap = import.meta.glob('@locales/*/*.json')
    appLog.info(`nsGlobbyMap:${JSON.stringify(Object.keys(nsGlobbyMap))}`)

    const namespaces = Object.keys(defaultResources.en)

    const res = await Promise.allSettled(
      namespaces.map(async (ns) => {
        const loader = nsGlobbyMap[`../../locales/${ns}/${lang}.json`]

        if (!loader)
          return
        const nsResources = await loader().then((m: any) => m.default)

        i18next.addResourceBundle(lang, ns, nsResources, true, true)
      }),
    )

    for (const r of res) {
      if (r.status === 'rejected') {
        // toast.error(`${t('common:tips.load-lng-error')}: ${lang}`)
        loadingLangLock.delete(lang)

        return
      }
    }
    EventBus.emit('I18N_UPDATE', '')
  }
  else {
    const importFilePath = `/locales/${lang}.js`
    // eslint-disable-next-line no-eval
    const res = await eval(`import('${importFilePath}')`)
      .then((res: any) => res?.default || res)
      .catch(() => {
        // toast.error(`${t('common:tips.load-lng-error')}: ${lang}`)
        appLog.error(`Failed to load language file: ${importFilePath}`)
        loadingLangLock.delete(lang)
        return {}
      })

    if (isEmptyObject(res)) {
      return
    }
    for (const namespace in res) {
      i18next.addResourceBundle(lang, namespace, res[namespace], true, true)
    }
  }

  await i18next.reloadResources()

  LocaleCache.shared.set(lang)
  loadedLangs.add(lang)
  loadingLangLock.delete(lang)
}
