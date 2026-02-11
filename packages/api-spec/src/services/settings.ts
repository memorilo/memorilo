import type { ApiError } from './common'
import type { CommandError } from './shared'
import { Effect } from 'effect'

export interface SettingsHandlers {
  readSettings: () => Effect.Effect<string, CommandError<ApiError | Error>>
  updateSettings: (content: string) => Effect.Effect<null, CommandError<ApiError | Error>>
  saveSettings: () => Effect.Effect<null, CommandError<ApiError | Error>>
}

export class SettingsService extends Effect.Tag('SettingsService')<SettingsService, SettingsHandlers>() {}
