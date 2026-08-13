import type { Entry, FileEntry } from '@zip.js/zip.js'
import { deferred } from '@memorilo/effect-lifecycle/testing'
import { afterEach, expect, it, vi } from 'vitest'
import { EpubResourceStore } from './epub-resource-store'

function entry(filename: string, bytes: Uint8Array | Promise<Uint8Array>): FileEntry {
  return {
    directory: false,
    encrypted: false,
    filename,
    getData: vi.fn(async () => bytes),
    uncompressedSize: 32,
  } as unknown as FileEntry
}

afterEach(() => {
  vi.restoreAllMocks()
})

it('drains an accepted rewrite, revokes its Blob URL, and rejects late reads', async () => {
  const image = deferred<Uint8Array>()
  const imageEntry = entry('image.png', image.promise)
  const store = new EpubResourceStore([
    entry('style.css', new TextEncoder().encode('body { background: url("image.png"); }')),
    imageEntry,
  ] as readonly Entry[])
  const createObjectUrl = vi.spyOn(URL, 'createObjectURL')
  const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL')

  const reading = store.read('style.css', 'text/css')
  await vi.waitFor(() => expect(imageEntry.getData).toHaveBeenCalledOnce())
  const firstClose = store.close()
  expect(store.close()).toBe(firstClose)
  let closed = false
  void firstClose.then(() => {
    closed = true
  })
  await Promise.resolve()
  expect(closed).toBe(false)
  await expect(store.readText('style.css')).rejects.toThrow('EPUB resources are closed')

  image.resolve(new Uint8Array([1, 2, 3]))
  await expect(reading).resolves.toBeInstanceOf(Uint8Array)
  await expect(firstClose).resolves.toBeUndefined()
  expect(createObjectUrl).toHaveBeenCalledOnce()
  expect(revokeObjectUrl).toHaveBeenCalledOnce()
})

it('retries only Blob URLs whose cleanup failed', async () => {
  const store = new EpubResourceStore([
    entry('first.png', new Uint8Array([1])),
    entry('second.png', new Uint8Array([2])),
    entry(
      'style.css',
      new TextEncoder().encode('body { background: url("first.png"); mask: url("second.png"); }'),
    ),
  ] as readonly Entry[])
  vi.spyOn(URL, 'createObjectURL')
    .mockReturnValueOnce('blob:first')
    .mockReturnValueOnce('blob:second')
  const cleanupError = new Error('first URL is still in use')
  const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url) => {
    if (url === 'blob:first' && revokeObjectUrl.mock.calls.length === 1)
      throw cleanupError
  })

  await store.read('style.css', 'text/css')
  const firstClose = store.close()
  expect(store.close()).toBe(firstClose)
  const failure = await firstClose.catch(error => error)
  expect(failure).toBeInstanceOf(AggregateError)
  expect((failure as AggregateError).errors).toEqual([
    expect.objectContaining({
      cause: cleanupError,
      message: 'Failed to close object URLs',
    }),
  ])

  await expect(store.close()).resolves.toBeUndefined()
  expect(revokeObjectUrl.mock.calls).toEqual([
    ['blob:first'],
    ['blob:second'],
    ['blob:first'],
  ])
})
