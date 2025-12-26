import { memorilo } from '@memorilo/core'
import * as log from '@tauri-apps/plugin-log'
import { Either, Option } from 'effect'
import i18next from 'i18next'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { fallbackLanguage, langChain } from '~/i18n'
import { loadLanguageAndApply } from '~/lib/load-language'

function useLanguageSync() {
  const lang = useSyncExternalStore((notify) => {
    const disposable = memorilo.settings.watch('core::lang', notify)
    return () => disposable.dispose()
  }, () => memorilo.settings.get<string>('core::lang').pipe(
    Either.getOrElse(() => Option.some(fallbackLanguage)),
  ).pipe(
    Option.getOrElse(() => fallbackLanguage),
  ))

  // marks the current applied language to avoid redundant loading
  // default is null to ensure the first load is always executed
  const currentLanguage = useRef<string>(null)

  useEffect(() => {
    if (currentLanguage.current === lang) {
      return
    }
    currentLanguage.current = lang

    if (lang === 'zh-TW') {
      loadLanguageAndApply('zh-CN')
    }
    loadLanguageAndApply(lang as string).then(() => {
      langChain.next(() => {
        log.info(`i18next language config switched to: ${lang}`)
        document.documentElement.lang = lang
        return i18next.changeLanguage(lang)
      })
    })
  }, [lang])
}

export function SettingSync() {
  useLanguageSync()
  return null
}
