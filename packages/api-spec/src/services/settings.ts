import type { ApiError } from './common'
import type { CommandError } from './shared'
import { Effect } from 'effect'

export interface EffectSettingsCommands {
  readSettings: () => Effect.Effect<string, CommandError<ApiError>>
  updateSettings: (content: string) => Effect.Effect<null, CommandError<ApiError>>
  saveSettings: () => Effect.Effect<null, CommandError<ApiError>>
}

export class SettingsService extends Effect.Tag('SettingsService')<SettingsService, EffectSettingsCommands>() {}
