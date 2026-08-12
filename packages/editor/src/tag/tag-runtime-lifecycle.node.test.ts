import type { EditorTag, EditorTagStorage } from '../adapters/editor-adapters'
import { deferred } from '@memorilo/effect-lifecycle/testing'
import { describe, expect, it, vi } from 'vitest'

import { TagRuntime, TagRuntimeClosedError } from './tag-runtime'

function createStorage(overrides: Partial<EditorTagStorage> = {}): EditorTagStorage {
  return {
    create: async tag => tag,
    search: async () => [],
    update: async tag => tag,
    ...overrides,
  }
}

describe('tag runtime lifecycle', () => {
  it('serializes writes and prevents an older result from replacing the latest state', async () => {
    const first = deferred<EditorTag>()
    const second = deferred<EditorTag>()
    const update = vi.fn<EditorTagStorage['update']>()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
    const runtime = new TagRuntime(createStorage({ update }))

    runtime.save({ id: 'tag', label: 'first' })
    runtime.save({ id: 'tag', label: 'second' })
    await vi.waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    first.resolve({ id: 'tag', label: 'first-canonical' })
    await first.promise
    await vi.waitFor(() => expect(update).toHaveBeenCalledTimes(2))
    expect(runtime.getSnapshot('tag')).toEqual({ status: 'saving', action: 'update' })

    const canonicalTag = { id: 'tag', label: 'second-canonical' }
    second.resolve(canonicalTag)
    await vi.waitFor(() => expect(runtime.getSnapshot('tag')).toEqual({
      status: 'saved',
      action: 'update',
      canonicalTag,
    }))
    await runtime.close()

    expect(runtime.getSnapshot('tag')).toEqual({
      status: 'saved',
      action: 'update',
      canonicalTag,
    })
  })

  it('drains accepted searches and writes before concurrent close calls resolve', async () => {
    const pendingSearch = deferred<readonly EditorTag[]>()
    const pendingUpdate = deferred<EditorTag>()
    const runtime = new TagRuntime(createStorage({
      search: () => pendingSearch.promise,
      update: () => pendingUpdate.promise,
    }))
    const search = runtime.search('project')
    runtime.save({ id: 'tag', label: 'project' })
    await vi.waitFor(() => expect(runtime.getSnapshot('tag')).toMatchObject({
      action: 'update',
      status: 'saving',
    }))

    const firstClose = runtime.close()
    const secondClose = runtime.close()
    let closed = false
    void firstClose.then(() => {
      closed = true
    })
    expect(secondClose).toBe(firstClose)
    expect(closed).toBe(false)

    pendingSearch.resolve([])
    pendingUpdate.resolve({ id: 'tag', label: 'project' })
    await Promise.all([search, firstClose])
    expect(closed).toBe(true)
  })

  it('rejects every operation admitted after close without calling storage', async () => {
    const storage = createStorage({
      create: vi.fn(async tag => tag),
      search: vi.fn(async () => []),
      update: vi.fn(async tag => tag),
    })
    const runtime = new TagRuntime(storage)
    await runtime.close()

    await expect(runtime.search('project')).rejects.toBeInstanceOf(TagRuntimeClosedError)
    expect(() => runtime.resolveOrCreate('project')).toThrow(TagRuntimeClosedError)
    expect(() => runtime.save({ id: 'tag', label: 'project' })).toThrow(TagRuntimeClosedError)
    expect(storage.search).not.toHaveBeenCalled()
    expect(storage.create).not.toHaveBeenCalled()
    expect(storage.update).not.toHaveBeenCalled()
  })

  it('does not let a stale search response replace a newer cached tag', async () => {
    const stale = deferred<readonly EditorTag[]>()
    const current = deferred<readonly EditorTag[]>()
    const create = vi.fn<EditorTagStorage['create']>(async tag => tag)
    const runtime = new TagRuntime(createStorage({
      create,
      search: ({ query }) => query === 'old' ? stale.promise : current.promise,
    }))
    const staleSearch = runtime.search('old')
    const currentSearch = runtime.search('current')
    const currentTag = { id: 'tag', label: 'current' }

    current.resolve([currentTag])
    await expect(currentSearch).resolves.toEqual([currentTag])
    stale.resolve([{ id: 'tag', label: 'old' }])
    await expect(staleSearch).resolves.toEqual([])

    expect(runtime.resolveOrCreate('current')).toEqual(currentTag)
    expect(create).not.toHaveBeenCalled()
    await runtime.close()
  })

  it('isolates listener failures from other subscribers and operation settlement', async () => {
    const listenerError = new Error('listener failed')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const runtime = new TagRuntime(createStorage())
    const healthyListener = vi.fn()
    runtime.subscribe(() => {
      throw listenerError
    })
    runtime.subscribe(healthyListener)

    runtime.save({ id: 'tag', label: 'project' })
    await vi.waitFor(() => expect(healthyListener).toHaveBeenCalledTimes(2))
    await runtime.close()

    expect(healthyListener).toHaveBeenCalledTimes(2)
    expect(consoleError).toHaveBeenCalledWith('Tag runtime listener failed', listenerError)
    consoleError.mockRestore()
  })
})
