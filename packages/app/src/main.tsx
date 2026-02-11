/* eslint-disable perfectionist/sort-imports */
// react-scan must be imported before react
import 'react-scan/all-environments'

import { memorilo } from '@memorilo/core'
import { initI18n } from './i18n'
import { loadSettingsAtStartup, registerMemoriloSettings } from './lib/register-settings'
import { Console, Effect } from 'effect'

export async function main() {
  await Effect.runPromise(
    Effect.gen(function* () {
      yield* Console.info('Registering initialize functions...')
      memorilo.registerPreInitializeFunction(registerMemoriloSettings)
      memorilo.registerInitializeFunction(loadSettingsAtStartup)

      yield* Console.info('Initializing memorilo...')
      yield* Effect.tryPromise({
        try: () => memorilo.initialize(),
        catch: cause => cause,
      })
      yield* Console.info('Memorilo initialized.')

      yield* Console.info('Initializing i18n...')
      yield* Effect.tryPromise({
        try: () => initI18n(),
        catch: cause => cause,
      })
      yield* Console.info('i18n initialized.')

      // defer import to ensure memorilo is initialized before app code runs
      yield* Console.info('Loading app module...')
      yield* Effect.tryPromise({
        try: async () => {
          const { renderApp } = await import('./app')
          renderApp()
        },
        catch: cause => cause,
      })
    }).pipe(
      Effect.catchAll((error) => {
        const message = error instanceof Error && error.message ? error.message : String(error)
        return Console.error(`Initialization failed: ${message}`).pipe(
          Effect.tap(() => Effect.sync(() => {
            document.body.innerHTML = `<div style="color:red;font-family:sans-serif;padding:2em"><h1>Application failed to start</h1><pre>${message}</pre></div>`
          })),
        )
      }),
    ),
  )
}
