import type { ImageUploadInput } from '../adapters/editor-adapters'
import { deferred } from '@memorilo/effect-lifecycle/testing'
import { describe, expect, it, vi } from 'vitest'

import { uploadErrorAtom, uploadStatusAtom } from '../state/editor-atoms'
import { createEditorStore } from '../state/editor-store'
import { EditorUploadRuntime, EditorUploadRuntimeClosedError } from './editor-upload-runtime'

const file = { name: 'image.png' } as File

describe('editor upload runtime', () => {
  it('keeps the shared status uploading until every concurrent upload settles', async () => {
    const first = deferred<string>()
    const second = deferred<string>()
    const uploadImage = vi.fn<(input: ImageUploadInput) => Promise<string>>()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
    const store = createEditorStore()
    const runtime = new EditorUploadRuntime(uploadImage, store)

    const firstUpload = runtime.uploader({ file, onProgress: vi.fn() })
    const secondUpload = runtime.uploader({ file, onProgress: vi.fn() })
    await vi.waitFor(() => expect(uploadImage).toHaveBeenCalledTimes(2))
    expect(store.get(uploadStatusAtom)).toBe('uploading')

    first.resolve('asset://first')
    await firstUpload
    expect(store.get(uploadStatusAtom)).toBe('uploading')

    second.resolve('asset://second')
    await secondUpload
    expect(store.get(uploadStatusAtom)).toBe('idle')
    await runtime.close()
  })

  it('drains accepted uploads while suppressing owner updates after close begins', async () => {
    const pending = deferred<string>()
    let reportProgress!: ImageUploadInput['onProgress']
    const uploadImage = vi.fn<(input: ImageUploadInput) => Promise<string>>((input) => {
      reportProgress = input.onProgress
      return pending.promise
    })
    const onProgress = vi.fn()
    const store = createEditorStore()
    const runtime = new EditorUploadRuntime(uploadImage, store)
    const upload = runtime.uploader({ file, onProgress })
    await vi.waitFor(() => expect(uploadImage).toHaveBeenCalledTimes(1))

    const close = runtime.close()
    expect(runtime.close()).toBe(close)
    expect(store.get(uploadStatusAtom)).toBe('idle')
    reportProgress({ loaded: 1, total: 2 })
    pending.resolve('asset://image')
    await Promise.all([upload, close])

    expect(onProgress).not.toHaveBeenCalled()
    expect(store.get(uploadErrorAtom)).toBeNull()
  })

  it('rejects admission after close without invoking the adapter', async () => {
    const uploadImage = vi.fn<(input: ImageUploadInput) => Promise<string>>(async () => 'asset://image')
    const runtime = new EditorUploadRuntime(uploadImage, createEditorStore())
    await runtime.close()

    await expect(runtime.uploader({ file, onProgress: vi.fn() })).rejects.toBeInstanceOf(EditorUploadRuntimeClosedError)
    expect(uploadImage).not.toHaveBeenCalled()
  })

  it('publishes adapter failures and returns to idle', async () => {
    const error = new Error('upload failed')
    const store = createEditorStore()
    const runtime = new EditorUploadRuntime(async () => {
      throw error
    }, store)

    await expect(runtime.uploader({ file, onProgress: vi.fn() })).rejects.toBe(error)
    expect(store.get(uploadErrorAtom)).toBe('upload failed')
    expect(store.get(uploadStatusAtom)).toBe('idle')
    await runtime.close()
  })
})
