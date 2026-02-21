import { setManagedRuntime } from '@memorilo/api-spec'
import { memorilo } from '@memorilo/core'
import { setFullscreen } from '@memorilo/tauri-plugin-android-statusbar'
import { PlatformEnum } from '@memorilo/utils/constants'
import { convert } from 'colorizr'
import { Console, Effect, Option } from 'effect'
import * as z from 'zod'
import { clientRuntime } from './api/runtime'

setManagedRuntime(clientRuntime)

function formatUnknownError(cause: unknown) {
  if (cause instanceof Error)
    return cause.stack ?? cause.message
  if (typeof cause === 'string')
    return cause
  try {
    return JSON.stringify(cause)
  }
  catch {
    return String(cause)
  }
}

if (PLATFORM === PlatformEnum.android) {
  memorilo.registerPreInitializeFunction(async (memorilo) => {
    memorilo.settings.register('core', [
      {
        key: 'androidFullscreen',
        schema: z.boolean(),
        defaultValue: true,
      },
    ])
    memorilo.effects.register([{
      id: 'androidFullscreenSyncEffect',
      signal: (cb) => {
        const disposable = memorilo.settings.watch('core::androidFullscreen', () => cb())
        return () => disposable.dispose()
      },
      state: () => {
        Effect.runPromise(
          Effect.gen(function* () {
            const value = yield* memorilo.settings.get<boolean>('core::androidFullscreen')
            const isFullscreen = value.pipe(Option.getOrElse(() => false))
            const statusBarColor = convert(window.getComputedStyle(document.body).getPropertyValue('--background'), 'hex')
            yield* Effect.tryPromise({
              try: () => setFullscreen(isFullscreen, {
                statusBarColor,
              }),
              catch: cause => new Error(`setFullscreen failed: ${formatUnknownError(cause)}`),
            })
          }),
        ).catch((error) => {
          const message = error && error instanceof Error ? error.message : String(error)
          return Effect.runPromise(
            Console.error(`Failed to sync Android fullscreen setting: ${message}`),
          )
        })
      },
    }])
  })
}

import('@memorilo/app/main').then(({ main }) => {
  main()
})
