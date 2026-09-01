import type { Uploader } from 'prosekit/extensions/file'
import type { EditorAdapters } from '../adapters/editor-adapters'
import type { EditorStore } from '../state/editor-store'
import { createOperationSupervisor, toError } from '@memorilo/effect-lifecycle'
import { uploadErrorAtom, uploadStatusAtom } from '../state/editor-atoms'

export class EditorUploadRuntimeClosedError extends Error {
  constructor() {
    super('Editor upload runtime is closed')
    this.name = 'EditorUploadRuntimeClosedError'
  }
}

export class EditorUploadRuntime {
  readonly #operations = createOperationSupervisor('Editor upload runtime', {
    closedError: () => new EditorUploadRuntimeClosedError(),
    concurrency: 'unbounded',
  })

  readonly #store: EditorStore
  readonly #uploadImage: EditorAdapters['uploadImage']
  #activeCount = 0

  readonly uploader: Uploader<string> = input => this.#operations.run(async () => {
    this.#activeCount += 1
    if (!this.#operations.isClosed()) {
      this.#store.set(uploadErrorAtom, null)
      this.#store.set(uploadStatusAtom, 'uploading')
    }

    try {
      return await this.#uploadImage({
        file: input.file,
        onProgress: (progress) => {
          if (!this.#operations.isClosed())
            input.onProgress(progress)
        },
      })
    }
    catch (error) {
      if (!this.#operations.isClosed())
        this.#store.set(uploadErrorAtom, toError(error).message)
      throw error
    }
    finally {
      this.#activeCount -= 1
      if (!this.#operations.isClosed() && this.#activeCount === 0)
        this.#store.set(uploadStatusAtom, 'idle')
    }
  })

  constructor(uploadImage: EditorAdapters['uploadImage'], store: EditorStore) {
    this.#uploadImage = uploadImage
    this.#store = store
  }

  get closed() {
    return this.#operations.isClosed()
  }

  close() {
    if (!this.#operations.isClosed()) {
      this.#store.set(uploadStatusAtom, 'idle')
    }
    return this.#operations.close()
  }
}
