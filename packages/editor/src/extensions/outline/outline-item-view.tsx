import type { NodeViewProps } from '@tiptap/react'
import { cn } from '@memorilo/utils'
import { NodeViewWrapper, useReactNodeView } from '@tiptap/react'
import { useCallback, useMemo, useState } from 'react'
import { MdChevronRight } from 'react-icons/md'
import { getOutlineLevel, isListContainerNode } from './outline-utils'

const OUTLINE_DOT_CENTER_PX = 20
const OUTLINE_ITEM_INDENT_PX = 32

export function OutlineItemView({ node, editor, getPos }: NodeViewProps) {
  const [hovered, setHovered] = useState(false)
  const isFolded = node.attrs.folded
  const { nodeViewContentRef } = useReactNodeView()
  const level = useMemo(() => {
    const pos = getPos()
    if (typeof pos !== 'number')
      return 1
    return getOutlineLevel(editor.state.doc.resolve(pos))
  }, [editor.state.doc, getPos])
  const hasChildren = useMemo(() => {
    let found = false
    node.forEach((child) => {
      if (isListContainerNode(child)) {
        found = true
      }
    })
    return found
  }, [node])

  const lineOffsets = useMemo(() => {
    if (level <= 1)
      return []
    return [
      OUTLINE_DOT_CENTER_PX - OUTLINE_ITEM_INDENT_PX,
    ]
  }, [level])

  const handleToggle = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()

      const pos = getPos()
      if (typeof pos !== 'number')
        return

      editor.commands.command(({ tr }) => {
        const currentNode = tr.doc.nodeAt(pos)
        if (!currentNode)
          return false

        tr.setNodeMarkup(pos, undefined, {
          ...currentNode.attrs,
          folded: !currentNode.attrs.folded,
        })

        return true
      })
    },
    [editor, getPos],
  )

  return (
    <NodeViewWrapper
      as="li"
      data-folded={isFolded ? 'true' : 'false'}
      className={cn(
        'relative my-[2px]',
        'data-[folded=true]:[&_ul]:hidden data-[folded=true]:[&_ol]:hidden',
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {lineOffsets.map(offset => (
        <span
          key={offset}
          aria-hidden="true"
          className="pointer-events-none absolute top-0 bottom-0 border-l border-dashed border-gray-300 dark:border-gray-600"
          style={{ left: offset }}
        />
      ))}
      <div className="flex items-start gap-1">
        <div className="relative mt-0.5 w-8 h-6 shrink-0">
          {hasChildren && (
            <button
              type="button"
              onMouseDown={handleToggle}
              onClick={e => e.preventDefault()}
              className={cn(
                'absolute left-0 top-0.5 w-5 h-5 z-10 flex items-center justify-center rounded cursor-pointer border-none bg-transparent hover:bg-gray-200 dark:hover:bg-gray-700',
                'transition-opacity duration-150',
                hovered ? 'opacity-100' : 'opacity-0 pointer-events-none',
              )}
            >
              <MdChevronRight
                className={cn(
                  'w-4 h-4 text-gray-600 dark:text-gray-400',
                  'transition-transform duration-200',
                  !isFolded && 'rotate-90',
                )}
              />
            </button>
          )}

          <div className="absolute right-0 top-0 w-6 h-6 flex items-center justify-center">
            <div className="w-1.5 h-1.5 rounded-full bg-black dark:bg-white" />
          </div>
        </div>

        <div className="flex-1 min-w-0 -ml-1">
          <div
            ref={nodeViewContentRef}
            data-node-view-content=""
            style={{ whiteSpace: 'pre-wrap' }}
          />
        </div>
      </div>
    </NodeViewWrapper>
  )
}
