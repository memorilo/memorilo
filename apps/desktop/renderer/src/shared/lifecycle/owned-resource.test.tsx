import { fireEvent, render, waitFor } from '@testing-library/react'
import { StrictMode, useState } from 'react'
import { expect, it, vi } from 'vitest'

import { useOwnedResource } from './owned-resource'

interface TestResource {
  close: () => Promise<void>
  id: string
}

it('acquires after commit and closes every StrictMode effect lifetime', async () => {
  const resources: TestResource[] = []
  const key = { id: 'stable' }

  function Harness() {
    const resource = useOwnedResource('Test resource', key, () => {
      const acquired = {
        close: vi.fn(async () => undefined),
        id: `resource-${resources.length + 1}`,
      }
      resources.push(acquired)
      return acquired
    })
    return <output>{resource?.id ?? 'pending'}</output>
  }

  const rendered = render(<StrictMode><Harness /></StrictMode>)
  await waitFor(() => expect(resources).toHaveLength(2))
  expect(resources[0]?.close).toHaveBeenCalledOnce()
  expect(resources[1]?.close).not.toHaveBeenCalled()
  expect(rendered.getByText('resource-2')).toBeInTheDocument()

  rendered.unmount()
  await waitFor(() => expect(resources[1]?.close).toHaveBeenCalledOnce())
})

it('replaces a keyed resource and reports cleanup failure without an unhandled rejection', async () => {
  const failure = new Error('cleanup failed')
  const onCloseError = vi.fn()
  const closeByKey = new Map<string, ReturnType<typeof vi.fn>>()

  function Harness() {
    const [key, setKey] = useState('first')
    const resource = useOwnedResource('Keyed resource', key, (currentKey) => {
      const close = vi.fn(async () => {
        if (currentKey === 'first')
          throw failure
      })
      closeByKey.set(currentKey, close)
      return { close, id: currentKey }
    }, onCloseError)
    return (
      <button type="button" onClick={() => setKey('second')}>
        {resource?.id ?? 'pending'}
      </button>
    )
  }

  const rendered = render(<Harness />)
  fireEvent.click(await rendered.findByRole('button', { name: 'first' }))

  await waitFor(() => expect(closeByKey.get('first')).toHaveBeenCalledOnce())
  await waitFor(() => expect(onCloseError).toHaveBeenCalledWith(failure))
  expect(rendered.getByRole('button', { name: 'second' })).toBeInTheDocument()

  rendered.unmount()
  await waitFor(() => expect(closeByKey.get('second')).toHaveBeenCalledOnce())
})
