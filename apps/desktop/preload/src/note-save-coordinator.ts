import type { NoteSaveResult } from './note-save-handshake'
import {
  combineLifecycleFailures,
  createOperationSupervisor,
  runLifecycleOperations,
} from '@memorilo/effect-lifecycle'

export type NoteSaveListener = () => Promise<void> | void

export function createNoteSaveCoordinator(send: (result: NoteSaveResult) => void) {
  const listeners = new Set<NoteSaveListener>()
  const operations = createOperationSupervisor('Renderer Note save coordinator')

  const handle = (requestId: string): Promise<void> => {
    return operations.run(async () => {
      await runLifecycleOperations(
        [...listeners].map(listener => () => listener()),
        'Multiple Note save listeners failed',
      )
      send({ requestId, status: 'saved' })
    }).catch((error) => {
      try {
        console.error('Failed to flush renderer Note updates before shutdown', error)
        send({
          message: error instanceof Error ? error.message : String(error),
          requestId,
          status: 'failed',
        })
      }
      catch (reportError) {
        throw combineLifecycleFailures(
          [error, reportError],
          'Renderer Note save failed and its result could not be reported',
        )
      }
    })
  }

  return {
    close: operations.close,
    handle,
    subscribe: (listener: NoteSaveListener): (() => void) => {
      if (operations.isClosed())
        throw new Error('Renderer Note save coordinator is closed')
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
