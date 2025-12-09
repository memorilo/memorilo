import { memorilo } from '@memorilo/core'

import { initI18n } from './i18n'
import { registerMemoriloSettings } from './lib/register-settings'
// react-scan must be imported before react
import 'react-scan/all-environments'

async function main() {
  memorilo.registerInitializeFunction(registerMemoriloSettings)

  await memorilo.initialize()
  await initI18n()

  // defer import to ensure memorilo is initialized before app code runs
  await import('./app').then(({ renderApp }) => {
    renderApp()
  })
}

main()
