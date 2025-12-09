import type { UnknownException } from 'effect/Cause'
import type { RendererSupportedLanguages } from '~/@types/constants'
import { EventBus } from '@memorilo/utils/event-bus'
import { isEmptyObject } from '@memorilo/utils/utils'

import * as log from '@tauri-apps/plugin-log'
import dayjs from 'dayjs'
import { Effect, Either } from 'effect'
import i18next from 'i18next'
import z from 'zod'
import { currentSupportedLanguages, dayjsLocaleImportMap } from '~/@types/constants'

import { defaultResources } from '~/@types/default-resource'
import { langChain, LocaleCache } from '~/i18n'

const loadingLangLock = new Set<string>()
const loadedLangs = new Set<string>(['en'])

export function validateLng(lng: string): Effect.Effect<RendererSupportedLanguages, UnknownException> {
  return Effect.try(() =>
    z.enum(currentSupportedLanguages).parse(lng) as RendererSupportedLanguages,
  )
}

export function loadLanguageAndApply(lang: string) {
  return Effect.gen(function* (_) {
    const lng = yield* _(validateLng(lang))

    const dayjsImport = dayjsLocaleImportMap[lng as keyof typeof dayjsLocaleImportMap]

    if (dayjsImport) {
      // load dayjs locale
      const locale = dayjsImport[0] as string
      const loader = dayjsImport[1] as () => Promise<any>
      yield* _(
        Effect.promise(() => loader())
          .pipe(
            Effect.andThen(() => {
              log.info(`dayjs loaded:  ${locale}`)
              langChain.next(() => {
                return dayjs.locale(locale)
              })
            }),
            Effect.fork,
          ),
      )
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

    yield* _(
      Effect.gen(function* (_) {
        if (import.meta.env.DEV) {
          const nsGlobbyMap = import.meta.glob('@locales/*/*.json')

          const namespaces = Object.keys(defaultResources.en)

          const results = yield* _(
            Effect.forEach(namespaces, (ns) => {
              return Effect.tryPromise({
                try: async () => {
                  const loader = nsGlobbyMap[`../../../locales/${ns}/${lang}.json`]

                  if (!loader)
                    return
                  const m: any = await loader()
                  return { ns, resources: m.default }
                },
                catch: e => e,
              }).pipe(Effect.either)
            }, { concurrency: 'unbounded' }),
          )

          for (const r of results) {
            if (Either.isLeft(r)) {
              // toast.error(`${t('common:tips.load-lng-error')}: ${lang}`)
              return
            }
            const data = r.right
            if (data) {
              i18next.addResourceBundle(lang, data.ns, data.resources, true, true)
            }
          }
          EventBus.emit('I18N_UPDATE', '')
        }
        else {
          const importFilePath = `/locales/${lang}.js`
          const res: any = yield* _(
            Effect.tryPromise({
              try: () =>
                // eslint-disable-next-line no-eval
                eval(`import('${importFilePath}')`)
                  .then((res: any) => res?.default || res),
              catch: () => {
                // toast.error(`${t('common:tips.load-lng-error')}: ${lang}`)
                return {}
              },
            }),
          )

          if (isEmptyObject(res)) {
            return
          }
          for (const namespace in res) {
            i18next.addResourceBundle(lang, namespace, res[namespace], true, true)
          }
        }

        yield* _(Effect.promise(() => i18next.reloadResources()))

        LocaleCache.shared.set(lang)
        loadedLangs.add(lang)
      }).pipe(
        Effect.ensuring(Effect.sync(() => loadingLangLock.delete(lang))),
      ),
    )
  })
}
