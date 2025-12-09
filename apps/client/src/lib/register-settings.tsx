import type { Memorilo } from '@memorilo/core'

import { t } from 'i18next'
import { z } from 'zod'
import { currentSupportedLanguages } from '~/@types/constants'
import { EnumInput, EnumInputOption } from '~/components/settings/inputs'
import { getEnumOptions } from './zod'

export function registerMemoriloSettings(memorilo: Memorilo) {
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
