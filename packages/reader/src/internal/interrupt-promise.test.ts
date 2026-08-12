import { deferred } from '@memorilo/effect-lifecycle/testing'
import { expect, it } from 'vitest'
import { interruptPromise } from './interrupt-promise'

it('reports abort only after the underlying transport has settled', async () => {
  const transport = deferred<void>()
  const controller = new AbortController()
  const interruption = new Error('reader already closed')
  controller.abort(interruption)

  const interrupted = interruptPromise(transport.promise, controller.signal)
  let settled = false
  void interrupted.then(undefined, () => {
    settled = true
  })
  await Promise.resolve()
  expect(settled).toBe(false)
  transport.reject(new Error('late transport failure'))
  await expect(interrupted).rejects.toBe(interruption)
})
