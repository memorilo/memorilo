import type { NodeType, Slice } from '@tiptap/pm/model'
import Image from '@tiptap/extension-image'
import { Plugin } from '@tiptap/pm/state'
import { getLeadingEmptyParagraphRange } from '../outline/core/outline-utils'
import './image.css'

function sliceHasImage(slice: Slice, imageType: NodeType) {
  if (slice.content.size === 0) {
    return false
  }

  let found = false
  slice.content.forEach((node) => {
    if (found)
      return
    if (node.type === imageType) {
      found = true
      return
    }

    node.descendants((child) => {
      if (found)
        return false
      if (child.type === imageType) {
        found = true
        return false
      }
      return undefined
    })
  })

  return found
}

export const OutlineImage = Image.extend({
  addCommands() {
    const parentCommands = this.parent?.()

    return {
      ...parentCommands,
      setImage:
        attrs =>
          (props) => {
            const range = getLeadingEmptyParagraphRange(props.state.selection.$from)
            if (range) {
              const imageType = props.state.schema.nodes.image
              if (!imageType) {
                return false
              }

              if (props.dispatch) {
                const tr = props.state.tr.replaceWith(range.from, range.to, imageType.create(attrs))
                props.dispatch(tr)
              }
              return true
            }

            const parentCommand = parentCommands?.setImage?.(attrs)
            return parentCommand ? parentCommand(props) : false
          },
    }
  },

  addProseMirrorPlugins() {
    const parentPlugins = this.parent?.() ?? []

    return [
      ...parentPlugins,
      new Plugin({
        props: {
          handlePaste: (view, _event, slice) => {
            const imageType = view.state.schema.nodes.image
            if (!imageType || !sliceHasImage(slice, imageType)) {
              return false
            }

            const range = getLeadingEmptyParagraphRange(view.state.selection.$from)
            if (!range) {
              return false
            }

            const tr = view.state.tr.replaceRange(range.from, range.to, slice)
            view.dispatch(tr)
            return true
          },
          handleDrop: (view, event, slice) => {
            if (!slice) {
              return false
            }

            const imageType = view.state.schema.nodes.image
            if (!imageType || !sliceHasImage(slice, imageType)) {
              return false
            }

            const coords = view.posAtCoords({ left: event.clientX, top: event.clientY })
            if (!coords) {
              return false
            }

            const range = getLeadingEmptyParagraphRange(view.state.doc.resolve(coords.pos))
            if (!range) {
              return false
            }

            const tr = view.state.tr.replaceRange(range.from, range.to, slice)
            view.dispatch(tr)
            return true
          },
        },
      }),
    ]
  },
})
