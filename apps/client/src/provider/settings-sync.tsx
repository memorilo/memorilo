import { memorilo } from '@memorilo/core'
import { Either, Option } from 'effect'
import i18next from 'i18next'
import { useEffect, useSyncExternalStore } from 'react'
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

  useEffect(() => {
    let mounted = true
    if (lang === 'zh-TW') {
      loadLanguageAndApply('zh-CN')
    }
    loadLanguageAndApply(lang as string).then(() => {
      langChain.next(() => {
        if (mounted) {
          return i18next.changeLanguage(lang)
        }
      })
    })
    return () => {
      mounted = false
    }
  }, [lang])
}

export function SettingSync() {
  useLanguageSync()
  return null
}
