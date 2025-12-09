import type { Memorilo } from './memorilo'
import { z } from 'zod'

export function registerMemoriloSettings(memorilo: Memorilo) {
  memorilo.settings.register('memorilo_core', z.object(
    {
      lang: z.enum(['zh-CN', 'en', '_detect']).default('_detect'),
    },
  ))
}
