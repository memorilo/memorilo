import type { EffectSettingsCommands } from '@memorilo/api-spec/command'
import { wrapCommand } from './shared'

export const effectSettingsCommands: EffectSettingsCommands = {
  readSettings: wrapCommand('readSettings'),
  updateSettings: wrapCommand('updateSettings'),
  saveSettings: wrapCommand('saveSettings'),
}
