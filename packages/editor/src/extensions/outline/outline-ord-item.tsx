import type { ReactNodeViewProps } from '@tiptap/react'
import { mergeAttributes } from '@tiptap/core'
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, useEditorState } from '@tiptap/react'
import { useEffect } from 'react'
import { OutlineUordItem } from './outline-uord-item'

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
})
