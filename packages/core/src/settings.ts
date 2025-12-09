import type { Memorilo } from './memorilo'
import { z } from 'zod'

export function registerMemoriloSettings(memorilo: Memorilo) {
  memorilo.settings.register('core', [
    {
      key: 'lang',
      label: 'Language',
      schema: z.enum(['zh-CN', 'en', '_auto']),
      defaultValue: '_auto',
    },
  ])
}
