import type { RendererSupportedLanguages } from '~/@types/constants'
import { EventBus } from '@memorilo/utils/event-bus'
import { isEmptyObject } from '@memorilo/utils/utils'
import dayjs from 'dayjs'
import { Console, Effect } from 'effect'

import i18next from 'i18next'
import { dayjsLocaleImportMap } from '~/@types/constants'
import { defaultResources } from '~/@types/default-resource'

import { langChain, LocaleCache } from '~/i18n'

const loadingLangLock = new Set<string>()
const loadedLangs = new Set<string>(['en'])

export async function loadLanguageAndApply(lang: RendererSupportedLanguages) {
  return Effect.runPromise(Effect.gen(function* () {
    const dayjsImport = dayjsLocaleImportMap[lang]

    if (dayjsImport) {
      const [locale, loader] = dayjsImport
      if (typeof locale !== 'string' || typeof loader !== 'function') {
        yield* Console.error(`dayjs locale or loader is invalid: ${lang}`)
        return
      }

      const dayjsResult = yield* Effect.tryPromise({
        try: () => loader(),
        catch: cause => cause,
      }).pipe(
        Effect.map(() => ({ ok: true as const })),
        Effect.catchAll(() => Effect.succeed({ ok: false as const })),
      )
      if (dayjsResult.ok) {
        yield* Console.info(`dayjs loaded: ${locale}`)
        langChain.next(() => {
          return dayjs.locale(locale)
        })
      }
    }

    // ipcServices?.app.switchAppLocale(lang)

    if (loadingLangLock.has(lang))
      return
    const loaded = loadedLangs.has(lang)

    if (loaded) {
      if (import.meta.env.DEV) {
        EventBus.emit('I18N_UPDATE', '')
      }
      return
    }

    loadingLangLock.add(lang)

    if (import.meta.env.DEV) {
      yield* Console.info(`Loading language resources for: ${lang} in DEV mode`)
      const nsGlobbyMap = import.meta.glob('@locales/*/*.json')

      const namespaces = Object.keys(defaultResources.en)

      for (const ns of namespaces) {
        const localeFileName = `../../locales/${ns}/${lang}.json`
        const loader = nsGlobbyMap[localeFileName]

        if (!loader)
          continue

        const res = yield* Effect.tryPromise({
          try: async () => {
            const mod: any = await loader()
            return mod.default
          },
          catch: cause => cause,
        }).pipe(
          Effect.map(value => ({ ok: true as const, value })),
          Effect.catchAll(() => Effect.succeed({ ok: false as const })),
        )

        if (!res.ok) {
          // toast.error(`${t('common:tips.load-lng-error')}: ${lang}`)
          yield* Console.error(`language ${lang} loader rejected`)
          loadingLangLock.delete(lang)
          return
        }

        yield* Console.info(`add locale ns ${localeFileName}`)
        i18next.addResourceBundle(lang, ns, res.value, true, true)
      }

      EventBus.emit('I18N_UPDATE', '')
    }
    else {
      const resResult = yield* Effect.tryPromise({
        try: async () => {
          const res = await import(`/locales/${lang}.js`)
          return res?.default || res
        },
        catch: cause => cause,
      }).pipe(
        Effect.map(value => ({ ok: true as const, value })),
        Effect.catchAll(() => Effect.succeed({ ok: false as const })),
      )

      if (!resResult.ok) {
        // toast.error(`${t('common:tips.load-lng-error')}: ${lang}`)
        yield* Console.error(`Failed to load language file: /locales/${lang}.js`)
        loadingLangLock.delete(lang)
        return
      }

      const res = resResult.value
      if (isEmptyObject(res)) {
        return
      }
      for (const namespace in res) {
        i18next.addResourceBundle(lang, namespace, res[namespace], true, true)
      }
    }

    yield* Effect.tryPromise({
      try: () => i18next.reloadResources(),
      catch: cause => cause,
    })

    LocaleCache.shared.set(lang)
    loadedLangs.add(lang)
    loadingLangLock.delete(lang)
  }))
}
