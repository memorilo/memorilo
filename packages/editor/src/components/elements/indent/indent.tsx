import type { RenderElementProps } from 'slate-react'
import { ChevronDownIcon } from '@memorilo/components/ui/animiated-icons/chevron-down'
import { GripVerticalIcon } from '@memorilo/components/ui/animiated-icons/grip-vertical'
import { Button } from '@memorilo/components/ui/button'
import { AnimatePresence, motion } from 'motion/react'
import { use, useCallback, useEffect, useMemo, useState } from 'react'
import { Node, Path, Element as SlateElement } from 'slate'
import { ReactEditor, useFocused, useSelected, useSlateSelector, useSlateStatic } from 'slate-react'
import { IndentChildCollapseContext, IndentDragContext, IndentEnableContext } from './contexts'

const MotionButton = motion(Button)

function useIndentConnections(element: SlateElement) {
  const hasIndentAbove = useSlateSelector((editor) => {
    try {
      const path = ReactEditor.findPath(editor, element)

      const index = path[path.length - 1]
      if (index !== undefined && index > 0) {
        const prevPath = Path.previous(path)
        if (Node.has(editor, prevPath)) {
          const prevNode = Node.get(editor, prevPath)
          if (SlateElement.isElement(prevNode) && (prevNode as any).type === 'indent') {
            return true
          }
        }
      }
    }
    catch {}
    return false
  })

  const hasIndentBelow = useSlateSelector((editor) => {
    try {
      const path = ReactEditor.findPath(editor, element)
      const nextPath = Path.next(path)
      if (Node.has(editor, nextPath)) {
        const nextNode = Node.get(editor, nextPath)
        if (SlateElement.isElement(nextNode) && (nextNode as any).type === 'indent') {
          return true
        }
      }
    }
    catch {}
    return false
  })

  return { hasIndentAbove, hasIndentBelow }
}

export function Indent(props: RenderElementProps) {
  const { collapsed, setCollapsed } = use(IndentChildCollapseContext)
  const enabled = use(IndentEnableContext)
  const drag = use(IndentDragContext)
  const { hasIndentAbove, hasIndentBelow } = useIndentConnections(props.element)
  const [childExpanded, setChildExpanded] = useState(true)
  const expandable = props.element.children.length > 1
  const contentGap = '1em'
  const isFocused = useFocused()
  const isSelected = useSelected()
  const editor = useSlateStatic()

  const childCollapsed = useMemo(() => ({
    collapsed: !childExpanded,
    setCollapsed: (collapsed: boolean) => {
      setChildExpanded(!collapsed)
    },
  }), [childExpanded])

  useEffect(() => {
    if (isFocused && isSelected) {
      setCollapsed(false)
    }
  }, [isFocused, isSelected, setCollapsed])

  const showButtons = useSlateSelector((editor) => {
    if (!editor.selection || !ReactEditor.isFocused(editor))
      return false
    try {
      const path = ReactEditor.findPath(editor, props.element)
      const firstChildPath = path.concat([0])
      return Path.isAncestor(firstChildPath, editor.selection.anchor.path) || Path.equals(firstChildPath, editor.selection.anchor.path)
    }
    catch {
      return false
    }
  })
  const toggleExpanded = () => {
    setChildExpanded(!childExpanded)
  }

  const isDragSource = drag.isDragging && drag.dragging?.element === props.element
  const isDropTarget = drag.isDragging && drag.over?.targetElement === props.element

  const dropIndicator = useMemo(() => {
    if (!isDropTarget || !drag.over)
      return null

    const { targetPath, position } = drag.over

    let containerDomNode: HTMLElement
    let containerRect: DOMRect
    try {
      containerDomNode = ReactEditor.toDOMNode(editor, props.element)
      containerRect = containerDomNode.getBoundingClientRect()
    }
    catch {
      return null
    }

    let headerRect: DOMRect | null = null
    try {
      const headerNode = Node.get(editor, targetPath.concat(0))
      if (SlateElement.isElement(headerNode)) {
        const headerDomNode = ReactEditor.toDOMNode(editor, headerNode) as HTMLElement
        headerRect = headerDomNode.getBoundingClientRect()
      }
    }
    catch {}

    const topOffset = (headerRect ?? containerRect).top - containerRect.top
    const bottomOffset = (headerRect ?? containerRect).bottom - containerRect.top

    if (position === 'before')
      return { y: topOffset, kind: 'before' as const }
    if (position === 'after')
      return { y: bottomOffset, kind: 'after' as const }
    return { y: bottomOffset, kind: 'inside' as const }
  }, [drag.over, editor, isDropTarget, props.element])

  const onPointerDownHandle = useCallback((event: React.PointerEvent) => {
    if (!enabled)
      return
    if (event.button !== 0)
      return
    event.preventDefault()
    event.stopPropagation()
    try {
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    }
    catch {}
    try {
      const sourcePath = ReactEditor.findPath(editor, props.element)
      drag.startDrag(sourcePath, props.element, event.pointerId)
    }
    catch {
      drag.endDrag()
    }
  }, [drag, editor, enabled, props.element])

  if (!enabled) {
    return (
      <div {...props.attributes}>
        {props.children}
      </div>
    )
  }

  return (
    <motion.div
      className={`relative ${isDragSource ? 'opacity-60' : ''}`}
      initial={false}
      animate={{
        height: collapsed ? 0 : 'auto',
        opacity: collapsed ? 0 : 1,
        transitionEnd: {
          overflow: collapsed ? 'hidden' : 'visible',
        },
      }}
      transition={{
        duration: 0.2,
      }}
      style={{
        paddingLeft: `calc(1.625rem + ${contentGap})`,
      }}
      data-collapsed={collapsed}
      data-drop-target={isDropTarget || undefined}
      data-drop-position={isDropTarget ? drag.over?.position : undefined}
      {...props.attributes}
    >
      {dropIndicator?.kind === 'before' && (
        <div
          contentEditable={false}
          className="absolute -translate-y-1/2 left-8 right-2 h-0.5 bg-primary pointer-events-none"
          style={{ top: dropIndicator.y }}
        />
      )}
      {dropIndicator?.kind === 'after' && (
        <div
          contentEditable={false}
          className="absolute -translate-y-1/2 left-8 right-2 h-0.5 bg-primary pointer-events-none"
          style={{ top: dropIndicator.y }}
        />
      )}
      {dropIndicator?.kind === 'inside' && (
        <div
          contentEditable={false}
          className="absolute -translate-y-1/2 left-12 right-2 h-0.5 bg-primary pointer-events-none"
          style={{ top: dropIndicator.y }}
        />
      )}
      <span
        contentEditable={false}
        className="absolute left-4 top-0 bottom-0 flex w-1 justify-center select-none"
      >
        {hasIndentAbove && (
          <span className="absolute top-0 h-[0.5lh] w-px bg-border" />
        )}
        <span className="absolute top-[0.5lh] -translate-y-1/2 right-[calc(50%-0.5rem)] flex items-center z-10 gap-1">
          <AnimatePresence>
            {showButtons && (
              <motion.div
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                className="flex gap-1 items-center"
              >
                <Button
                  variant="outline"
                  size="icon-sm"
                  className="w-4 cursor-grab active:cursor-grabbing"
                  aria-label="拖动节点"
                  title="拖动节点"
                  onPointerDown={onPointerDownHandle}
                >
                  <GripVerticalIcon />
                </Button>
                {expandable && (
                  <MotionButton
                    animate={{ rotate: childExpanded ? 0 : -90 }}
                    transition={{
                      type: 'keyframes',
                      duration: 0.1,
                    }}
                    variant="ghost"
                    size="icon-sm"
                    className="size-4"
                    onClick={toggleExpanded}
                  >
                    <ChevronDownIcon />
                  </MotionButton>
                )}
              </motion.div>
            )}
          </AnimatePresence>
          <span className="flex items-center justify-center size-4">
            <span className="h-1.25 w-1.25 rounded-full bg-foreground" />
          </span>
        </span>

        <span className={`absolute top-[0.5lh] w-px bg-border ${hasIndentBelow ? 'bottom-0' : 'bottom-2'}`} />
      </span>
      <IndentChildCollapseContext value={childCollapsed}>
        {props.children}
      </IndentChildCollapseContext>
    </motion.div>
  )
}
