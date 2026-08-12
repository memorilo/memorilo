import type { EditorTag, EditorTagStorage } from '../adapters/editor-adapters'
import { deferred } from '@memorilo/effect-lifecycle/testing'
import { describe, expect, it, vi } from 'vitest'

import { TagRuntime } from './tag-runtime'

function createStorage(overrides: Partial<EditorTagStorage> = {}): EditorTagStorage {
  return {
    search: async () => [],
    create: async tag => tag,
    update: async tag => tag,
    ...overrides,
  }
}

describe('tag runtime', () => {
  it('deduplicates concurrent creation of the same normalized label', async () => {
    const pendingCreate = deferred<EditorTag>()
    const create = vi.fn<EditorTagStorage['create']>(() => pendingCreate.promise)
    const runtime = new TagRuntime(createStorage({ create }))

    const first = runtime.resolveOrCreate(' Project ')
    const second = runtime.resolveOrCreate('project')

    expect(second).toEqual(first)
    expect(create).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledWith(first)

    pendingCreate.resolve(first)
    await vi.waitFor(() => expect(runtime.getSnapshot(first.id)).toEqual({
      status: 'saved',
      action: 'create',
      canonicalTag: first,
    }))
    await runtime.close()
  })

  it('retries a failed create and exposes the canonical stored tag', async () => {
    const canonicalTag = { id: 'tag-canonical', label: 'Project' }
    const create = vi.fn<EditorTagStorage['create']>()
      .mockRejectedValueOnce(new Error('Create failed'))
      .mockResolvedValueOnce(canonicalTag)
    const runtime = new TagRuntime(createStorage({ create }))

    const optimisticTag = runtime.resolveOrCreate('Project')
    await vi.waitFor(() => expect(runtime.getSnapshot(optimisticTag.id)).toEqual({
      status: 'error',
      action: 'create',
      error: 'Create failed',
    }))

    runtime.save(optimisticTag)
    await vi.waitFor(() => expect(runtime.getSnapshot(optimisticTag.id)).toEqual({
      status: 'saved',
      action: 'create',
      canonicalTag,
    }))
    expect(create).toHaveBeenCalledTimes(2)
    expect(runtime.resolveOrCreate('project')).toEqual(canonicalTag)
    await runtime.close()
  })

  it('removes an obsolete optimistic label when storage returns a different canonical label', async () => {
    const canonicalTag = { id: 'tag-canonical', label: 'project-canonical' }
    const create = vi.fn<EditorTagStorage['create']>()
      .mockResolvedValueOnce(canonicalTag)
      .mockImplementationOnce(async tag => tag)
    const runtime = new TagRuntime(createStorage({ create }))

    const optimisticTag = runtime.resolveOrCreate('project')
    await vi.waitFor(() => expect(runtime.getSnapshot(optimisticTag.id)).toEqual({
      status: 'saved',
      action: 'create',
      canonicalTag,
    }))
    expect(runtime.resolveOrCreate('project-canonical')).toEqual(canonicalTag)

    const recreatedTag = runtime.resolveOrCreate('project')

    expect(recreatedTag.id).not.toBe(optimisticTag.id)
    expect(recreatedTag.label).toBe('project')
    expect(create).toHaveBeenCalledTimes(2)
    await runtime.close()
  })

  it('retries a failed update as an update', async () => {
    const existingTag = { id: 'tag-existing', label: 'existing' }
    const update = vi.fn<EditorTagStorage['update']>()
      .mockRejectedValueOnce(new Error('Update failed'))
      .mockResolvedValueOnce(existingTag)
    const runtime = new TagRuntime(createStorage({ update }))

    runtime.save(existingTag)
    await vi.waitFor(() => expect(runtime.getSnapshot(existingTag.id)).toEqual({
      status: 'error',
      action: 'update',
      error: 'Update failed',
    }))

    runtime.save(existingTag)
    await vi.waitFor(() => expect(runtime.getSnapshot(existingTag.id)).toEqual({
      status: 'saved',
      action: 'update',
      canonicalTag: existingTag,
    }))
    expect(update).toHaveBeenCalledTimes(2)
    await runtime.close()
  })
})
