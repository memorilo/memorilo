import type { ImageOptions } from '@tiptap/extension-image'
import Image from '@tiptap/extension-image'
import { createImagePastePlugin } from './paste-plugin'
import './image.css'

const MemoriloImage = Image.extend<ImageOptions>({
  addAttributes() {
    return {
      ...this.parent?.(),
      assetId: {
        default: null,
        parseHTML: element => element.getAttribute('data-asset-id'),
        renderHTML: (attributes) => {
          if (typeof attributes.assetId !== 'string' || attributes.assetId.length === 0) {
            return {}
          }
          return {
            'data-asset-id': attributes.assetId,
          }
        },
      },
    }
  },

  addProseMirrorPlugins() {
    const parentPlugins = this.parent?.() ?? []

    return [
      ...parentPlugins,
      createImagePastePlugin(this.editor, this.name),
    ]
  },
}).configure({
  resize: {
    enabled: true,
    directions: ['top', 'right', 'bottom', 'left', 'bottom-right'],
    minWidth: 24,
    minHeight: 24,
    alwaysPreserveAspectRatio: false,
  },
})

export default MemoriloImage
