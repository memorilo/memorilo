import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { NodeViewProps } from '@tiptap/react'
import { GripVerticalIcon } from '@memorilo/components/ui/animiated-icons/grip-vertical'
import { cn } from '@memorilo/utils'
import { NodeViewWrapper, useReactNodeView } from '@tiptap/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { MdChevronRight } from 'react-icons/md'
import { startOutlineDrag } from './outline-dnd'
import { findListItem, getOutlineLevel, isListContainerNode } from './outline-utils'

const OUTLINE_DOT_CENTER_PX = 20
const OUTLINE_ITEM_INDENT_PX = 32

interface TaskItemViewOptions {
  onReadOnlyChecked?: (node: ProseMirrorNode, checked: boolean) => boolean
  a11y?: {
    checkboxLabel?: (node: ProseMirrorNode, checked: boolean) => string
  }
}

export function OutlineItemView({ node, editor, getPos, extension }: NodeViewProps) {
  const [hovered, setHovered] = useState(false)
  const isTaskItem = node.type.name === 'taskItem'
  const isOrderedItem = node.type.name === 'orderedItem'
  const isChecked = Boolean(node.attrs.checked)
  const isFolded = node.attrs.folded
  const { nodeViewContentRef } = useReactNodeView()
  const [orderedIndex, setOrderedIndex] = useState<number | null>(null)
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

  const resolveOrderedIndex = useCallback(() => {
    if (!isOrderedItem)
      return null
    const pos = getPos()
    if (typeof pos !== 'number')
      return null
    const resolvedPos = Math.min(pos + 1, editor.state.doc.content.size)
    let $pos
    try {
      $pos = editor.state.doc.resolve(resolvedPos)
    }
    catch {
      return null
    }
    const listItem = findListItem($pos)
    if (!listItem || listItem.depth < 1)
      return null
    return $pos.index(listItem.depth - 1) + 1
  }, [editor, getPos, isOrderedItem])

  useEffect(() => {
    if (!isOrderedItem) {
      setOrderedIndex(null)
      return
    }
    const updateIndex = () => {
      setOrderedIndex(resolveOrderedIndex())
    }
    updateIndex()
    editor.on('transaction', updateIndex)
    return () => {
      editor.off('transaction', updateIndex)
    }
  }, [editor, isOrderedItem, resolveOrderedIndex])

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

  const handleGripMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const pos = getPos()
    if (typeof pos === 'number')
      startOutlineDrag(editor, pos, e.nativeEvent)
  }, [editor, getPos])

  const checkboxLabel = useMemo(() => {
    if (!isTaskItem)
      return undefined
    const labelBuilder = (extension?.options as TaskItemViewOptions | undefined)
      ?.a11y
      ?.checkboxLabel
    if (labelBuilder) {
      return labelBuilder(node, isChecked)
    }
    return `Task item checkbox for ${node.textContent || 'empty task item'}`
  }, [extension?.options, isChecked, isTaskItem, node])

  const handleCheckboxChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const nextChecked = event.currentTarget.checked
    if (!editor.isEditable) {
      const onReadOnlyChecked = (extension?.options as TaskItemViewOptions | undefined)
        ?.onReadOnlyChecked
      if (!onReadOnlyChecked || !onReadOnlyChecked(node, nextChecked)) {
        event.currentTarget.checked = !nextChecked
      }
      return
    }

    const pos = getPos()
    if (typeof pos !== 'number')
      return

    editor
      .chain()
      .focus(undefined, { scrollIntoView: false })
      .command(({ tr }) => {
        const currentNode = tr.doc.nodeAt(pos)
        if (!currentNode)
          return false
        tr.setNodeMarkup(pos, undefined, {
          ...currentNode.attrs,
          checked: nextChecked,
        })
        return true
      })
      .run()
  }, [editor, extension?.options, getPos, node])

  let dotContent = <div className="w-1.5 h-1.5 rounded-full bg-black dark:bg-white" />
  if (isTaskItem) {
    dotContent = (
      <label
        className="flex h-6 w-6 items-center justify-center"
        contentEditable={false}
        onMouseDown={e => e.preventDefault()}
      >
        <input
          type="checkbox"
          checked={isChecked}
          onChange={handleCheckboxChange}
          className="h-4 w-4 cursor-pointer"
          aria-label={checkboxLabel}
        />
      </label>
    )
  }
  else if (isOrderedItem) {
    dotContent = (
      <span className="font-mono text-gray-700 dark:text-gray-200">
        {(orderedIndex ?? 1).toString()}
        .
      </span>
    )
  }

  return (
    <NodeViewWrapper
      as="li"
      data-outline-item="true"
      data-outline-level={level}
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
      <div className="flex w-full items-start gap-1" data-outline-row>
        <div className={cn('relative w-8 h-6 shrink-0', isTaskItem ? 'mt-0' : 'mt-0.5')}>
          <button
            type="button"
            onMouseDown={handleGripMouseDown}
            onClick={e => e.preventDefault()}
            className={cn(
              'absolute -left-5 top-0.5 w-5 h-5 z-10 flex items-center justify-center rounded cursor-grab active:cursor-grabbing border-none bg-transparent hover:bg-gray-200 dark:hover:bg-gray-700',
              'transition-opacity duration-150',
              hovered ? 'opacity-100' : 'opacity-0 pointer-events-none',
            )}
            aria-label="Drag item"
          >
            <GripVerticalIcon size={14} className="text-gray-600 dark:text-gray-400" />
          </button>
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

          <div className="absolute right-0 top-0 w-6 h-6 flex items-center justify-center" data-outline-dot>
            {dotContent}
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
