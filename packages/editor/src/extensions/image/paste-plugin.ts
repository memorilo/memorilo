import type { Editor } from '@tiptap/core'
import { runPromise } from '@memorilo/api-spec'
import { Plugin } from '@tiptap/pm/state'
import { Effect } from 'effect'
import { getClipboardImageSources } from './clipboard-image-source'
import { getPasteInsertionRange } from './paste-insertion'
import { persistClipboardImageSource } from './persist-image-source'

export function createImagePastePlugin(editor: Editor, nodeName: string) {
  return new Plugin({
    props: {
      handlePaste: (_view, event) => {
        if (!event.clipboardData) {
          return false
        }

        let sources
        try {
          sources = getClipboardImageSources(event.clipboardData)
        }
        catch (error) {
          console.error('Failed to read pasted image data.', error)
          return true
        }

        if (sources.length === 0) {
          return false
        }

        const insertionRange = getPasteInsertionRange(editor)
        const persistImagesEffect = Effect.forEach(
          sources,
          source => persistClipboardImageSource(source),
          { concurrency: 1 },
        )

        runPromise(persistImagesEffect)
          .then((images) => {
            editor
              .chain()
              .focus()
              .insertContentAt(insertionRange, images.map(attrs => ({
                type: nodeName,
                attrs,
              })))
              .run()
          })
          .catch((error) => {
            console.error('Failed to persist pasted image.', error)
          })

        return true
      },
    },
  })
}
