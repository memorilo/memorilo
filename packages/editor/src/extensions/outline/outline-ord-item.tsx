import type { ReactNodeViewProps } from '@tiptap/react'
import { mergeAttributes } from '@tiptap/core'
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import { OutlineUordItem } from './outline-uord-item'

function OutlineOrdItemView(_props: ReactNodeViewProps) {
  // TODO: Implement auto numbering and renumbering when items are added, removed, or moved.
  return (
    <NodeViewWrapper className="relative">
      <div
        contentEditable={false}
        className="absolute -left-8 top-0 w-6 h-6 flex items-center justify-center rounded-full group transition-all hover:bg-accent"
      >
        <span className="text-sm font-mono transition-all group-hover:scale-125">
          0.
        </span>
      </div>
      <NodeViewContent />
    </NodeViewWrapper>
  )
}
export const OutlineOrdItem = OutlineUordItem.extend({
  name: 'outlineOrdItem',
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
