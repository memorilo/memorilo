import type { DetectLanguageError } from '@memorilo/api-spec/services/os'
import type { RendererSupportedLanguages } from '~/@types/constants'
import { runPromise } from '@memorilo/api-spec'
import { OSService } from '@memorilo/api-spec/services/os'
import { memorilo } from '@memorilo/core'
import { Console, Effect, Either, Option } from 'effect'
import i18next from 'i18next'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import * as z from 'zod'
import { currentSupportedLanguages } from '~/@types/constants'
import { fallbackLanguage, langChain } from '~/i18n'
import { loadLanguageAndApply } from '~/lib/load-language'
import { DEFAULT_LANGUAGE_AUTO } from '~/lib/register-settings'

function parseLanguageOrDetect(
  lang: string,
): Effect.Effect<RendererSupportedLanguages, DetectLanguageError, OSService> {
  const languageSchema = z.enum([
    ...currentSupportedLanguages,
    DEFAULT_LANGUAGE_AUTO,
  ] as const)

  return Effect.gen(function* () {
    const parseResult = languageSchema.safeParse(lang)

    if (parseResult.success && parseResult.data !== DEFAULT_LANGUAGE_AUTO) {
      return parseResult.data
    }

    const { detectLanguage } = yield* OSService
    const detected = yield* detectLanguage(
      currentSupportedLanguages,
      () => fallbackLanguage,
    )

    return detected as RendererSupportedLanguages
  })
}

function useLanguageSync() {
  const originalLang = useSyncExternalStore((notify) => {
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
    runPromise(parseLanguageOrDetect(originalLang)).then((lang) => {
      if (currentLanguage.current === lang) {
        return
      }
      if (originalLang === DEFAULT_LANGUAGE_AUTO) {
        memorilo.settings.set('core::lang', lang)
      }

      currentLanguage.current = lang
      // if (lang === 'zh-TW') {
      //   loadLanguageAndApply('zh-CN')
      // }
      loadLanguageAndApply(lang).then(() => {
        langChain.next(async () => {
          await Effect.runPromise(Console.info(`i18next language config switched to: ${lang}`))
          document.documentElement.lang = lang
          return i18next.changeLanguage(lang)
        })
      })
    })
  }, [originalLang])
}

export function SettingSync() {
  useLanguageSync()
  return null
}
