import type { Uploader } from 'prosekit/extensions/file'
import type { EditorAdapters } from '../adapters/editor-adapters'
import type { EditorStore } from '../state/editor-store'
import { defineBasicExtension } from 'prosekit/basic'
import { union } from 'prosekit/core'
import { defineCodeBlockShiki } from 'prosekit/extensions/code-block'
import { defineHorizontalRule } from 'prosekit/extensions/horizontal-rule'
import { defineImageUploadHandler } from 'prosekit/extensions/image'
import { defineMath } from 'prosekit/extensions/math'

import { defineMention } from 'prosekit/extensions/mention'
import { definePlaceholder } from 'prosekit/extensions/placeholder'
import { renderKaTeXMathBlock, renderKaTeXMathInline } from '../sample/katex.ts'
import { uploadErrorAtom, uploadStatusAtom } from '../state/editor-atoms'
import { defineCodeBlockView } from '../ui/code-block-view/index.ts'
import { defineImageView } from '../ui/image-view/index.ts'
import { defineTaskListView } from '../ui/task-list-view/index.ts'

function createUploader(adapters: EditorAdapters, store: EditorStore): Uploader<string> {
  return async ({ file, onProgress }) => {
    store.set(uploadErrorAtom, null)
    store.set(uploadStatusAtom, 'uploading')

    try {
      return await adapters.uploadImage({ file, onProgress })
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      store.set(uploadErrorAtom, message)
      throw error
    }
    finally {
      store.set(uploadStatusAtom, 'idle')
    }
  }
}

export function createEditorExtension(adapters: EditorAdapters, store: EditorStore) {
  const uploader = createUploader(adapters, store)

  return {
    extension: union(
      defineBasicExtension(),
      definePlaceholder({ placeholder: 'Press / for commands...' }),
      defineMention(),
      defineMath({
        renderMathBlock: renderKaTeXMathBlock,
        renderMathInline: renderKaTeXMathInline,
      }),
      defineCodeBlockShiki(),
      defineHorizontalRule(),
      defineCodeBlockView(),
      defineImageView(),
      defineTaskListView(),
      defineImageUploadHandler({
        uploader,
        onError: ({ error }) => {
          const message = error instanceof Error ? error.message : String(error)
          store.set(uploadErrorAtom, message)
        },
      }),
    ),
    uploader,
  }
}

export type EditorExtension = ReturnType<typeof createEditorExtension>['extension']
