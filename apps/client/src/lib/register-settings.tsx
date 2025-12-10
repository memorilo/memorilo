import type { Memorilo } from '@memorilo/core'

import * as log from '@tauri-apps/plugin-log'
import { Effect, Either, Option } from 'effect'
import { z } from 'zod'
import { currentSupportedLanguages } from '~/@types/constants'
import { EnumInput, EnumInputOption } from '~/components/settings/inputs'
import { getI18n } from '~/i18n'
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
  const i18next = getI18n()
  const { t } = i18next
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
}
