import { runLifecycleOperations } from '@memorilo/effect-lifecycle'

export interface ReaderSessionCleanupOptions {
  close: () => Promise<void>
  flush: () => Promise<void>
}

/**
 * Flushes renderer-owned Note changes and closes the native reading session.
 * Both phases are attempted so a failed final write cannot leak the session.
 */
export function cleanupReaderSession({ close, flush }: ReaderSessionCleanupOptions): Promise<void> {
  return runLifecycleOperations(
    [
      async () => {
        try {
          await flush()
        }
        catch (error) {
          throw new Error('Failed to flush reader Note persistence', { cause: error })
        }
      },
      async () => {
        try {
          await close()
        }
        catch (error) {
          throw new Error('Failed to close reader session', { cause: error })
        }
      },
    ],
    'Reader session cleanup failed',
    'sequential',
  )
}
