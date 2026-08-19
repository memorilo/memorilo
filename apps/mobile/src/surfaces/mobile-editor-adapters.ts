'use dom'

import type { SavedEditorImage, SaveEditorImageInput } from './editor-surface-contract'
import { demoEditorAdapters } from '@memorilo/editor'
import { encodeBinary } from './editor-surface-contract'

export function createMobileEditorAdapters(saveImage: (input: SaveEditorImageInput) => Promise<SavedEditorImage>) {
  return {
    ...demoEditorAdapters,
    uploadImage: async ({ file, onProgress }: Parameters<typeof demoEditorAdapters.uploadImage>[0]) => {
      const total = Math.max(file.size, 1)
      onProgress({ loaded: 0, total })
      const saved = await saveImage({
        data: encodeBinary(new Uint8Array(await file.arrayBuffer())),
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
      })
      onProgress({ loaded: total, total })
      return saved.src
    },
  }
}
