import type { ReactNodeViewProps } from '@tiptap/react'
import { mergeAttributes } from '@tiptap/core'
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, useEditorState } from '@tiptap/react'
import { Option } from 'effect'
import { useEffect } from 'react'
import { OutlineOrdList } from './outline-ord-list'
import { OutlineUordItem } from './outline-uord-item'
import { getParentBlock, getParentOutlineItem, getParentOutlineList } from './utils/outlines'

function OutlineOrdItemView(props: ReactNodeViewProps) {
  const index = useEditorState({
    editor: props.editor,
    selector: () => {
      const offset = 1
      const nodePos = props.editor.$pos(
        props.getPos()!,
      )
      if (nodePos.depth < offset) {
        return 0
      }
      const resolvedPos = props.editor.state.doc.resolve(props.getPos()!)

      return resolvedPos.index(nodePos.depth - offset)
    },
  })

  // Update the `number` attribute whenever the index changes
  // It will be used to render the correct number in the ordered list item which is focused on and lost context
  useEffect(() => {
    if (index === 0) {
      return
    }
    queueMicrotask(() => {
      props.updateAttributes({
        number: index,
      })
    })
  }, [index, props])

  return (
    <NodeViewWrapper className="relative">
      <div
        contentEditable={false}
        className="absolute -left-8 top-0 w-6 h-6 flex items-center justify-center rounded-full group transition-all hover:bg-accent"
      >
        <span className="text-sm font-mono transition-all group-hover:scale-125">
          {index === 0 ? props.node.attrs.number : index}
          .
        </span>
      </div>
      <NodeViewContent />
    </NodeViewWrapper>
  )
}
export const OutlineOrdItem = OutlineUordItem.extend({
  name: 'outlineOrdItem',
  addAttributes() {
    return {
      number: {
        default: 0,
      },
    }
  },
  parseHTML() {
    return [
      {
        tag: 'outline-ord-item',
      },
    ]
  },
  renderHTML({ HTMLAttributes }) {
    return ['outline-ord-item', mergeAttributes(HTMLAttributes), 0]
  },
  addNodeView() {
    return ReactNodeViewRenderer(OutlineOrdItemView)
  },
  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => {
        // Backspace for ordered items only handles one transition:
        // when cursor is at the first block start and this ordered layer is unique,
        // convert current ordered item + parent ordered list back to unordered.
        const { selection } = editor.state
        // Only work on empty selection at the beginning of the node
        if (!selection.empty || selection.$from.parentOffset !== 0) {
          return false
        }

        const currentNode = editor.$pos(selection.$from.pos)
        const ctx = Option.gen(function* () {
          const block = yield* getParentBlock(currentNode)
          const item = yield* getParentOutlineItem(block)
          const list = yield* getParentOutlineList(item)
          const parentList = yield* getParentOutlineList(list)
          return { item, parentList }
        })
        // structure is not correct, do nothing
        if (Option.isNone(ctx)) {
          return false
        }
        const { item, parentList } = ctx.value

        // item and list type is not correct, do nothing
        if (item.node.type.name !== OutlineOrdItem.name || parentList.node.type.name !== OutlineOrdList.name) {
          return false
        }

        // Convert ordered -> unordered when this ordered layer is the only child-list branch.
        // Example:
        //   ordered item
        //   - ordered item   <- Backspace at start of this item converts current item/layer back to unordered.
        const isUniqueOrdLayer = parentList.node.childCount === 2
          && selection.$from.index(parentList.depth) === 1
          && parentList.node.child(1).type.isInGroup('outlineList')

        if (!isUniqueOrdLayer) {
          return false
        }
        const outlineUordItemType = editor.state.schema.nodes.outlineUordItem!
        const outlineUListType = editor.state.schema.nodes.outlineUList!
        const tr = editor.state.tr
        tr.setNodeMarkup(
          tr.mapping.map(selection.$from.before(item.depth)),
          outlineUordItemType,
          item.node.attrs,
        )
        tr.setNodeMarkup(
          tr.mapping.map(selection.$from.before(parentList.depth)),
          outlineUListType,
          parentList.node.attrs,
        )
        editor.view.dispatch(tr.scrollIntoView())
        return true
      },
    }
  },
})
