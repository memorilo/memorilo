import type { Memorilo } from '@memorilo/core'

import log from '@memorilo/api/log'
import { Effect, Either } from 'effect'
import { z } from 'zod'
import { currentSupportedLanguages } from '~/@types/constants'
import { EnumInput, EnumInputOption } from '~/components/settings/inputs'
import { getI18n } from '~/i18n'
import { loadSettings, saveSettings } from './settings'
import { getEnumOptions } from './zod'

export async function loadSettingsAtStartup() {
  const result = await Effect.runPromise(loadSettings())
  if (Either.isLeft(result)) {
    log.error(result.left.message)
  }
}

export const DEFAULT_LANGUAGE_AUTO = '_auto'

export function registerMemoriloSettings(memorilo: Memorilo) {
  const i18next = getI18n()
  const { t } = i18next
  memorilo.settings.watch('*', () => {
    Effect.runPromise(saveSettings())
  })
  memorilo.settings.register('core', [
    {
      key: 'lang',
      schema: z.enum([...currentSupportedLanguages, DEFAULT_LANGUAGE_AUTO]),
      defaultValue: DEFAULT_LANGUAGE_AUTO,
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

  memorilo.settings.register('dev', [
    {
      key: 'scan',
      schema: z.boolean(),
      defaultValue: false,
    },
    {
      key: 'router',
      schema: z.boolean(),
      defaultValue: false,
    },
    {
      key: 'query',
      schema: z.boolean(),
      defaultValue: false,
    },
  ])
}
