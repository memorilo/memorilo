import process from 'node:process'
import { toError } from '@memorilo/effect-lifecycle'
import { Effect } from 'effect'
import { createSinglePortServer } from '../infrastructure/http/single-port-server'
import { loadSyncServerConfig } from './config'
import { createSyncServerRuntime } from './runtime'

const waitForShutdownSignal = Effect.callback<void>((resume) => {
  const shutdown = (): void => resume(Effect.void)
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
  return Effect.sync(() => {
    process.off('SIGINT', shutdown)
    process.off('SIGTERM', shutdown)
  })
})

const program = Effect.scoped(Effect.gen(function* () {
  const config = yield* Effect.tryPromise({ catch: toError, try: () => loadSyncServerConfig() })
  const runtime = yield* Effect.acquireRelease(
    Effect.tryPromise({ catch: toError, try: () => createSyncServerRuntime(config) }),
    current => Effect.tryPromise({ catch: toError, try: current.close }).pipe(Effect.orDie),
  )
  const server = createSinglePortServer({
    fetch: runtime.app.fetch,
    host: config.host,
    peerPort: runtime.peerPort,
    port: config.port,
  })
  const port = yield* Effect.acquireRelease(
    Effect.tryPromise({ catch: toError, try: server.listen }),
    () => Effect.tryPromise({ catch: toError, try: server.close }).pipe(Effect.orDie),
  )
  yield* Effect.sync(() => process.stderr.write(`Memorilo Sync Server listening on http://${config.host}:${port}\n`))
  yield* waitForShutdownSignal
  yield* Effect.tryPromise({ catch: toError, try: runtime.beginDrain })
}))

void Effect.runPromise(program).catch((error) => {
  console.error('Memorilo Sync Server failed', error)
  process.exitCode = 1
})
