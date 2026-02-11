import type { SettingsHandlers } from '@memorilo/api-spec/services/settings'
import { wrapCommand } from './shared'

export const settingsHandlers: SettingsHandlers = {
  readSettings: wrapCommand('readSettings'),
  updateSettings: wrapCommand('updateSettings'),
  saveSettings: wrapCommand('saveSettings'),
}
