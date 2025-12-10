import { effectCommands } from '@memorilo/api/command'
import { memorilo } from '@memorilo/core'
import * as log from '@tauri-apps/plugin-log'
import { Effect } from 'effect'

export function loadSettings() {
  return Effect.gen(function* () {
    const settings = yield* effectCommands.readSettings()
    log.info(`Settings loaded from storage: ${JSON.stringify(settings)}`)

    return memorilo.settings.fromJSON(settings)
  })
}

export function saveSettings() {
  return Effect.gen(function* () {
    const settings = memorilo.settings.toJSON()
    log.info(`Saving settings to storage: ${JSON.stringify(settings)}`)
    yield* effectCommands.updateSettings(settings)
  })
}
