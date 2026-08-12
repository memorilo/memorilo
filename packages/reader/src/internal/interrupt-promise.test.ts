import { deferred } from '@memorilo/effect-lifecycle/testing'
import { expect, it } from 'vitest'
import { interruptPromise } from './interrupt-promise'

it('observes a late transport rejection when interruption already happened', async () => {
  const transport = deferred<void>()
  const controller = new AbortController()
  const interruption = new Error('reader already closed')
  controller.abort(interruption)

  const interrupted = interruptPromise(transport.promise, controller.signal)

  await expect(interrupted).rejects.toBe(interruption)
  transport.reject(new Error('late transport failure'))
  await new Promise<void>(resolve => queueMicrotask(resolve))
})
