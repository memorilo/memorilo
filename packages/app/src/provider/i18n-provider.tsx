import type { PropsWithChildren } from 'react'
import log from '@memorilo/api/log'
import { memorilo } from '@memorilo/core'
import { Disposable } from '@memorilo/core/utils/disposable'
import { EventBus } from '@memorilo/utils/event-bus'
import { Either, Option } from 'effect'
import i18next from 'i18next'
import { useAtom } from 'jotai'
import { useEffect } from 'react'
import { I18nextProvider } from 'react-i18next'
import { fallbackLanguage, i18nAtom } from '~/i18n'

export function I18nProvider({ children }: PropsWithChildren) {
  const [currentI18NInstance, update] = useAtom(i18nAtom)

  if (import.meta.env.DEV) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(
      () => {
        const disposable = Disposable.fromExternal(() => {
          const lang = memorilo.settings.get<string>('core::lang').pipe(
            Either.getOrElse(() => Option.some(fallbackLanguage)),
          ).pipe(
            Option.map(lang => lang === '_auto' ? navigator.language : lang),
            Option.getOrElse(() => fallbackLanguage),
          )

          const nextI18n = i18next.cloneInstance({
            lng: lang,
          })
          log.info(`I18nProvider detected I18N_UPDATE event, refresh language ${lang}`)

          update(nextI18n)
        }, cb => EventBus.on('I18N_UPDATE', cb), cb => EventBus.off('I18N_UPDATE', cb))
        return () => disposable.dispose()
      },
      [update],
    )
  }

  return <I18nextProvider i18n={currentI18NInstance}>{children}</I18nextProvider>
}
