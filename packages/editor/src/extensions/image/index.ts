import type { ImageOptions } from '@tiptap/extension-image'
import { mergeAttributes } from '@tiptap/core'
import Image from '@tiptap/extension-image'
import { createSetImageCommand } from './commands'
import { createImageNodeView } from './node-view'
import { createImageProseMirrorPlugin } from './pm-plugin'
import './image.css'

interface OutlineImageOptions extends ImageOptions {
  downloadImage: boolean
}

export const OutlineImage = Image.extend<OutlineImageOptions>({
  addOptions() {
    const parent = this.parent?.() ?? {
      inline: false,
      allowBase64: false,
      HTMLAttributes: {},
      resize: false,
    }
    return { ...parent, downloadImage: false }
  },

  addAttributes() {
    return {
      ...this.parent?.(),
      assetId: {
        default: null,
        // Persist the local asset reference into HTML so copy/paste/export can round-trip.
        parseHTML: element => element.getAttribute('data-asset-id'),
        renderHTML: attrs => (attrs.assetId ? { 'data-asset-id': attrs.assetId } : {}),
      },
      uploadId: {
        default: null,
        // Runtime-only: used to patch the node after async asset jobs complete.
        parseHTML: () => null,
        renderHTML: () => ({}),
      },
      uploadError: {
        default: null,
        // Runtime-only: failure indicator for async jobs (rendered as a placeholder).
        parseHTML: () => null,
        renderHTML: () => ({}),
      },
    }
  },

  parseHTML() {
    const baseTag = this.options.allowBase64 ? 'img[src]' : 'img[src]:not([src^="data:"])'
    return [
      { tag: baseTag },
      { tag: 'img[data-asset-id]' },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    // Keep default <img> rendering, but allow extra attributes like data-asset-id.
    return ['img', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes)]
  },

  addNodeView() {
    return createImageNodeView({ resize: this.options.resize })
  },

  addCommands() {
    const parentCommands = this.parent?.()
    const downloadImage = Boolean(this.options.downloadImage)

    return {
      ...parentCommands,
      setImage: createSetImageCommand({
        parentSetImage: parentCommands?.setImage,
        downloadImage,
        getView: () => this.editor.view,
      }),
    }
  },

  addProseMirrorPlugins() {
    const parentPlugins = this.parent?.() ?? []
    const downloadImage = Boolean(this.options.downloadImage)

    return [
      ...parentPlugins,
      createImageProseMirrorPlugin({ downloadImage }),
    ]
  },
})
