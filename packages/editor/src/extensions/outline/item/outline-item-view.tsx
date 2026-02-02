import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { NodeViewProps } from '@tiptap/react'
import { cn } from '@memorilo/utils'
import { GapCursor } from '@tiptap/pm/gapcursor'
import { NodeViewContent, NodeViewWrapper } from '@tiptap/react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getOutlineLevel, isListContainerNode, isOutlineMediaNode } from '../core/outline-utils'
import { startOutlineDrag } from '../dnd/outline-dnd'
import { OutlineItemControls } from './outline-item-controls'
import { OutlineItemDot } from './outline-item-dot'
import { useOrderedIndex } from './outline-item-hooks'

interface TaskItemViewOptions {
  onReadOnlyChecked?: (node: ProseMirrorNode, checked: boolean) => boolean
  onOutlineClick?: (uuid: string) => void
  a11y?: {
    checkboxLabel?: (node: ProseMirrorNode, checked: boolean) => string
  }
}

export function OutlineItemView({ node, editor, getPos, extension }: NodeViewProps) {
  const { t, i18n } = useTranslation('app')
  const [hovered, setHovered] = useState(false)
  const isTaskItem = node.type.name === 'taskItem'
  const isOrderedItem = node.type.name === 'orderedItem'
  const isChecked = Boolean(node.attrs.checked)
  const isFolded = node.attrs.folded
  const hideTitle = Boolean(editor.storage.paragraph?.hideTitle)
  const level = useMemo(() => {
    const pos = getPos()
    if (typeof pos !== 'number')
      return 1
    return getOutlineLevel(editor.state.doc.resolve(pos))
  }, [editor.state.doc, getPos])
  const isRootItem = useMemo(() => {
    const pos = getPos()
    return typeof pos === 'number' && pos === 0
  }, [getPos])
  const showTitleGutter = !(hideTitle && isRootItem)
  // Only nested items get a guide line; the root title gets one unless it's hidden.
  const shouldRenderIndentGuide = level > 1 || (isRootItem && !hideTitle)
  const hasChildren = useMemo(() => {
    let found = false
    node.forEach((child) => {
      if (isListContainerNode(child)) {
        found = true
      }
    })
    return found
  }, [node])
  const hasLeadingMedia = useMemo(() => {
    const firstChild = node.firstChild
    if (!firstChild) {
      return false
    }
    return isOutlineMediaNode(firstChild)
  }, [node])
  const orderedIndex = useOrderedIndex(editor, getPos, isOrderedItem)
  const onOutlineClick = (extension?.options as TaskItemViewOptions | undefined)?.onOutlineClick

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

  const handleMediaGapMouseDown = useCallback((event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    if (!editor.view) {
      return
    }
    const pos = getPos()
    if (typeof pos !== 'number') {
      return
    }
    const gapPos = pos + 1
    const $gap = editor.state.doc.resolve(gapPos)
    const tr = editor.state.tr.setSelection(new GapCursor($gap))
    editor.view.dispatch(tr.scrollIntoView())
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
    const fallbackTitle = t('editor.outline.empty_task_item')
    return t('editor.outline.task_checkbox_label', {
      title: node.textContent || fallbackTitle,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extension?.options, i18n.language, isChecked, isTaskItem, node, t])

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

  const handleBulletClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (isTaskItem || isOrderedItem) {
      return
    }
    const uuid = node.attrs?.uuid
    if (typeof uuid !== 'string' || uuid.length === 0) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    onOutlineClick?.(uuid)
  }, [isOrderedItem, isTaskItem, node.attrs?.uuid, onOutlineClick])

  return (
    <NodeViewWrapper
      as="li"
      data-outline-item="true"
      data-outline-level={level}
      data-folded={isFolded ? 'true' : 'false'}
      className={cn(
        'list-none',
        'relative',
        hideTitle && isRootItem ? 'my-0' : 'my-0.5',
        'data-[folded=true]:[&_ul]:hidden data-[folded=true]:[&_ol]:hidden',
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {shouldRenderIndentGuide
        ? (
            <span
              aria-hidden="true"
              className={cn(
                'pointer-events-none absolute border-l border-dashed border-gray-300 dark:border-gray-600',
                isRootItem ? 'top-6 bottom-0 left-5' : 'top-0 bottom-0 -left-3',
              )}
            />
          )
        : null}
      <div
        className={cn(
          'flex w-full items-start',
          hasLeadingMedia ? 'gap-0' : 'gap-1',
        )}
        data-outline-row
      >
        {showTitleGutter
          ? (
              <div
                className={cn('relative w-8 h-6 shrink-0', isTaskItem ? 'mt-0' : 'mt-0.5')}
              >
                <OutlineItemControls
                  hovered={hovered}
                  hasChildren={hasChildren}
                  isFolded={isFolded}
                  onToggle={handleToggle}
                  onGripMouseDown={handleGripMouseDown}
                />
                <div className="absolute right-0 top-0 w-6 h-6 flex items-center justify-center" data-outline-dot>
                  <OutlineItemDot
                    isTaskItem={isTaskItem}
                    isOrderedItem={isOrderedItem}
                    isChecked={isChecked}
                    orderedIndex={orderedIndex}
                    checkboxLabel={checkboxLabel}
                    onCheckboxChange={handleCheckboxChange}
                    onBulletClick={handleBulletClick}
                  />
                </div>
              </div>
            )
          : null}

        <div
          className={cn(
            'relative flex-1 min-w-0',
            hasLeadingMedia ? 'pl-2' : '-ml-1',
          )}
        >
          {hasLeadingMedia && editor.isEditable
            ? (
                <button
                  type="button"
                  aria-label={t('editor.outline.media_gap_cursor')}
                  className="absolute left-0 top-0 bottom-0 w-2 cursor-text"
                  onMouseDown={handleMediaGapMouseDown}
                  tabIndex={-1}
                  contentEditable={false}
                />
              )
            : null}
          <NodeViewContent className="whitespace-pre-wrap" />
        </div>
      </div>
    </NodeViewWrapper>
  )
}
