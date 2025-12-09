import { memorilo } from '@memorilo/core'

// react-scan must be imported before react
import 'react-scan/all-environments'

async function main() {
  await memorilo.initialize()

  // defer import to ensure memorilo is initialized before app code runs
  await import('./app').then(({ renderApp }) => {
    renderApp()
  })
}

main()
