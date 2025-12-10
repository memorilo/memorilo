/* eslint-disable perfectionist/sort-imports */
// react-scan must be imported before react
import 'react-scan/all-environments'

import { memorilo } from '@memorilo/core'
import { initI18n } from './i18n'
import { loadSettingsAtStartup, registerMemoriloSettings } from './lib/register-settings'
import * as log from '@tauri-apps/plugin-log'

async function main() {
  log.info('Registering initialize functions...')
  memorilo.registerPreInitializeFunction(registerMemoriloSettings)
  memorilo.registerInitializeFunction(loadSettingsAtStartup)

  log.info('Initializing memorilo...')
  await memorilo.initialize()
  log.info('Memorilo initialized.')

  log.info('Initializing i18n...')
  await initI18n()
  log.info('i18n initialized.')

  // defer import to ensure memorilo is initialized before app code runs
  log.info('Loading app module...')
  await import('./app').then(({ renderApp }) => {
    renderApp()
  })
}

main()
