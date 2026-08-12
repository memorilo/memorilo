import type { EditorAdapters } from '../adapters/editor-adapters'
import { deferred } from '@memorilo/effect-lifecycle/testing'
import { describe, expect, it, vi } from 'vitest'

import { NetworkImagePasteRuntime } from './network-image-paste'

function createAdapters(importNetworkImage?: EditorAdapters['importNetworkImage']): EditorAdapters {
  return {
    importNetworkImage,
    tagStorage: {
      create: async tag => tag,
      search: async () => [],
      update: async tag => tag,
    },
    uploadImage: async () => 'memory://image',
  }
}

describe('network image paste runtime', () => {
  it('owns imports until close and suppresses view mutation after closing begins', async () => {
    const pending = deferred<string>()
    const applyReplacement = vi.fn()
    const runtime = new NetworkImagePasteRuntime(createAdapters(() => pending.promise))

    expect(runtime.startImport('https://example.com/image.png', 'temporary', applyReplacement)).toBe(true)
    const close = runtime.close()
    expect(runtime.close()).toBe(close)
    let closed = false
    void close.then(() => {
      closed = true
    })
    await Promise.resolve()
    expect(closed).toBe(false)

    pending.resolve('asset://image')
    await close

    expect(closed).toBe(true)
    expect(applyReplacement).not.toHaveBeenCalled()
  })

  it('rejects admission after close without invoking the importer', async () => {
    const importNetworkImage = vi.fn(async () => 'asset://image')
    const runtime = new NetworkImagePasteRuntime(createAdapters(importNetworkImage))
    await runtime.close()

    expect(runtime.startImport('https://example.com/image.png', 'temporary', vi.fn())).toBe(false)
    expect(importNetworkImage).not.toHaveBeenCalled()
  })

  it('records successful replacements for later document updates', async () => {
    const applyImmediately = vi.fn()
    const applyLater = vi.fn()
    const runtime = new NetworkImagePasteRuntime(createAdapters(async () => 'asset://image'))

    runtime.startImport('https://example.com/image.png', 'temporary', applyImmediately)
    await vi.waitFor(() => expect(applyImmediately).toHaveBeenCalledWith('temporary', 'asset://image'))
    runtime.applyCompletedReplacements(applyLater)

    expect(applyLater).toHaveBeenCalledWith('temporary', 'asset://image')
    await runtime.close()
  })

  it('restores the source after import failure without leaking a rejected promise', async () => {
    const error = new Error('download failed')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const applyReplacement = vi.fn()
    const runtime = new NetworkImagePasteRuntime(createAdapters(async () => {
      throw error
    }))

    runtime.startImport('https://example.com/image.png', 'temporary', applyReplacement)
    await vi.waitFor(() => expect(applyReplacement).toHaveBeenCalledWith(
      'temporary',
      'https://example.com/image.png',
    ))

    expect(consoleError).toHaveBeenCalledWith(
      'Failed to download pasted image https://example.com/image.png',
      error,
    )
    await runtime.close()
    consoleError.mockRestore()
  })

  it('isolates a stale view replacement failure from import settlement', async () => {
    const replacementError = new Error('view destroyed')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const runtime = new NetworkImagePasteRuntime(createAdapters(async () => 'asset://image'))

    runtime.startImport('https://example.com/image.png', 'temporary', () => {
      throw replacementError
    })
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalledWith(
      'Failed to replace pasted image temporary',
      replacementError,
    ))
    await runtime.close()
    consoleError.mockRestore()
  })
})
