import type { ReactNodeViewProps } from '@tiptap/react'
import { mergeAttributes, Node, NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'

function OutlineItemView(_props: ReactNodeViewProps) {
  return (
    <NodeViewWrapper className="relative">
      <div className="absolute -left-8 top-0 w-6 h-6 flex items-center justify-center">
        <span className="h-1.5 w-1.5 rounded-full bg-black dark:bg-white" />
      </div>
      <NodeViewContent />
    </NodeViewWrapper>
  )
}

export const OutlineItem = Node.create({
  name: 'outlineUordItem',
  content: 'block+',
  group: 'outlineItem',
  parseHTML() {
    return [
      {
        tag: 'outline-uord-item',
      },
    ]
  },
  renderHTML({ HTMLAttributes }) {
    return ['outline-uord-item', mergeAttributes(HTMLAttributes), 0]
  },
  addNodeView() {
    return ReactNodeViewRenderer(OutlineItemView)
  },
})

function OutlineTaskItemView(_props: ReactNodeViewProps) {
  return (
    <NodeViewWrapper className="relative">
      <div className="absolute -left-8 top-0 w-6 h-6 flex items-center justify-center">
        <input type="checkbox" className="h-3 w-3" />
      </div>
      <NodeViewContent />
    </NodeViewWrapper>
  )
}

export const OutlineTaskItem = Node.create({
  name: 'outlineTaskItem',
  content: 'block+',
  group: 'outlineItem',
  parseHTML() {
    return [
      {
        tag: 'outline-task-item',
      },
    ]
  },
  renderHTML({ HTMLAttributes }) {
    return ['outline-task-item', mergeAttributes(HTMLAttributes), 0]
  },
  addNodeView() {
    return ReactNodeViewRenderer(OutlineTaskItemView)
  },
})
