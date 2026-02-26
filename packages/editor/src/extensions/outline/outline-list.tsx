import type { ReactNodeViewProps } from '@tiptap/react'
import { mergeAttributes, Node } from '@tiptap/core'
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'

function OutlineListView(_props: ReactNodeViewProps) {
  // The first child of the outline list is always the outline item,
  // so if there are more than 1 children, it means that there are sub lists
  //   const hasChildren = props.node.children.length > 1

  return (
    <NodeViewWrapper className="relative">
      <span
        className="absolute border-l border-dashed border-gray-300 dark:border-gray-600 top-6 bottom-0 left-5"
      />
      <NodeViewContent className="pl-10" />
    </NodeViewWrapper>
  )
}

export const OutlineList = Node.create({
  name: 'outlineUList',
  content: 'outlineItem outlineList*',
  group: 'outlineList',
  parseHTML() {
    return [
      {
        tag: 'outline-list',
      },
    ]
  },
  renderHTML({ HTMLAttributes }) {
    return ['outline-list', mergeAttributes(HTMLAttributes), 0]
  },
  addNodeView() {
    return ReactNodeViewRenderer(OutlineListView)
  },
})
