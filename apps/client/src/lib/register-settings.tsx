import type { Memorilo } from '@memorilo/core'

import * as log from '@tauri-apps/plugin-log'
import { Effect, Either, Option } from 'effect'
import i18next, { t } from 'i18next'
import { z } from 'zod'
import { currentSupportedLanguages } from '~/@types/constants'
import { EnumInput, EnumInputOption } from '~/components/settings/inputs'
import { loadLanguageAndApply } from './load-language'
import { loadSettings, saveSettings } from './settings'
import { getEnumOptions } from './zod'

export async function loadSettingsAtStartup() {
  const result = await Effect.runPromise(loadSettings())
  if (Either.isLeft(result)) {
    log.error(result.left.message)
  }
}

export function registerMemoriloSettings(memorilo: Memorilo) {
  memorilo.settings.watch('*', () => {
    Effect.runPromise(saveSettings())
  })
  memorilo.settings.register('core', [
    {
      key: 'lang',
      schema: z.enum([...currentSupportedLanguages, '_auto']),
      defaultValue: '_auto',
      component: ({ value, onChange, schema }) => {
        const options = getEnumOptions(schema).filter(v => !v.startsWith('_'))
        return (
          <EnumInput value={value} onChange={onChange}>
            {
              options.map((opt: any) => (
                <EnumInputOption key={opt} value={opt}>
                  {t('lang:name', { lng: opt })}
                  {' '}
                  (
                  {I18N_COMPLETENESS_MAP[opt]}
                  %)
                </EnumInputOption>
              ))
            }
          </EnumInput>
        )
      },

    },
  ])

  memorilo.settings.watch<string>('core::lang', (newLang) => {
    newLang.pipe(
      Option.map((lang) => {
        log.info(`Load language: ${lang}`)
        loadLanguageAndApply(lang).then(() => {
          i18next.changeLanguage(lang)
        })
        return Effect.succeed(void 0)
      }),
      Option.getOrElse(() => Effect.fail('Target language is empty')),
    )
  })
}
