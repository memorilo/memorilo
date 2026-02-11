import { SettingsService } from '@memorilo/api-spec/services/settings'
import { memorilo } from '@memorilo/core'
import { Console, Effect } from 'effect'

export function loadSettings() {
  return Effect.gen(function* () {
    const settingsService = yield* SettingsService
    const settings = yield* settingsService.readSettings()
    yield* Console.info(`Settings loaded from storage: ${JSON.stringify(settings)}`)

    return memorilo.settings.fromJSON(settings)
  })
}

export function saveSettings() {
  return Effect.gen(function* () {
    const settingsService = yield* SettingsService
    const settings = memorilo.settings.toJSON()
    yield* Console.info(`Saving settings to storage: ${JSON.stringify(settings)}`)
    yield* settingsService.updateSettings(settings)
  })
}
