import type { RenderElementProps } from 'slate-react'
import { ChevronDownIcon } from '@memorilo/components/ui/animiated-icons/chevron-down'
import { GripVerticalIcon } from '@memorilo/components/ui/animiated-icons/grip-vertical'
import { Button } from '@memorilo/components/ui/button'
import { AnimatePresence, motion } from 'motion/react'
import { use, useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
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

function getOutlineMetrics(element: SlateElement) {
  const header = element.children[0] as any
  switch (header?.type) {
    case 'h1':
      return { firstLineHeight: '2.25rem', topOffset: '0rem' }
    case 'h2':
      return { firstLineHeight: '2rem', topOffset: '0rem' }
    case 'h3':
      return { firstLineHeight: '1.75rem', topOffset: '0rem' }
    case 'h4':
      return { firstLineHeight: '1.75rem', topOffset: '0rem' }
    case 'h5':
      return { firstLineHeight: '1.5rem', topOffset: '0rem' }
    case 'h6':
      return { firstLineHeight: '1.5rem', topOffset: '0rem' }
    case 'codeblock':
      return { firstLineHeight: '1.25rem', topOffset: '0.5rem' }
    case 'divider':
      return { firstLineHeight: '1.5rem', topOffset: '0.5rem' }
    case 'todo':
      return { firstLineHeight: '1.5rem', topOffset: '0.25rem' }
    default:
      return { firstLineHeight: '1.5rem', topOffset: '0rem' }
  }
}

export function Indent(props: RenderElementProps) {
  const { collapsed, setCollapsed } = use(IndentChildCollapseContext)
  const enabled = use(IndentEnableContext)
  const drag = use(IndentDragContext)
  const { hasIndentAbove, hasIndentBelow } = useIndentConnections(props.element)
  const [childExpanded, setChildExpanded] = useState(true)
  const expandable = props.element.children.length > 1
  const isFocused = useFocused()
  const isSelected = useSelected()
  const editor = useSlateStatic()
  const [measuredFirstLineHeight, setMeasuredFirstLineHeight] = useState<string>()

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

  useLayoutEffect(() => {
    if (!enabled) {
      return
    }

    let cancelled = false
    let nextMeasuredFirstLineHeight: string | undefined

    try {
      const header = (props.element as any).children?.[0]
      if (!SlateElement.isElement(header)) {
        nextMeasuredFirstLineHeight = undefined
      }
      else {
        const domNode = ReactEditor.toDOMNode(editor, header) as HTMLElement
        const style = window.getComputedStyle(domNode)

        let lineHeight = Number.parseFloat(style.lineHeight)
        if (Number.isNaN(lineHeight)) {
          const fontSize = Number.parseFloat(style.fontSize)
          if (!Number.isNaN(fontSize)) {
            lineHeight = fontSize * 1.2
          }
        }

        if (!Number.isNaN(lineHeight) && lineHeight > 0) {
          nextMeasuredFirstLineHeight = `${lineHeight}px`
        }
        else {
          nextMeasuredFirstLineHeight = undefined
        }
      }
    }
    catch {
      nextMeasuredFirstLineHeight = undefined
    }

    queueMicrotask(() => {
      if (cancelled)
        return
      setMeasuredFirstLineHeight((prev) => {
        if (prev === nextMeasuredFirstLineHeight)
          return prev
        return nextMeasuredFirstLineHeight
      })
    })

    return () => {
      cancelled = true
    }
  }, [editor, enabled, props.element])

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

  const metrics = useMemo(() => {
    const base = getOutlineMetrics(props.element as any)
    return measuredFirstLineHeight
      ? { ...base, firstLineHeight: measuredFirstLineHeight }
      : base
  }, [measuredFirstLineHeight, props.element])

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
        paddingLeft: 'var(--memorilo-outline-indent)',
        ['--memorilo-outline-first-line' as any]: metrics.firstLineHeight,
        ['--memorilo-outline-top-offset' as any]: metrics.topOffset,
      }}
      data-collapsed={collapsed}
      data-drop-target={isDropTarget || undefined}
      data-drop-position={isDropTarget ? drag.over?.position : undefined}
      {...props.attributes}
    >
      {dropIndicator?.kind === 'before' && (
        <div
          contentEditable={false}
          className="absolute -translate-y-1/2 right-2 h-0.5 bg-primary pointer-events-none"
          style={{ top: dropIndicator.y, left: 'var(--memorilo-outline-indent)' }}
        />
      )}
      {dropIndicator?.kind === 'after' && (
        <div
          contentEditable={false}
          className="absolute -translate-y-1/2 right-2 h-0.5 bg-primary pointer-events-none"
          style={{ top: dropIndicator.y, left: 'var(--memorilo-outline-indent)' }}
        />
      )}
      {dropIndicator?.kind === 'inside' && (
        <div
          contentEditable={false}
          className="absolute -translate-y-1/2 right-2 h-0.5 bg-primary pointer-events-none"
          style={{ top: dropIndicator.y, left: 'calc(var(--memorilo-outline-indent) + 1rem)' }}
        />
      )}
      <div
        contentEditable={false}
        className="absolute left-0 top-0 bottom-0 w-(--memorilo-outline-indent) select-none pointer-events-none"
      >
        {hasIndentAbove && (
          <span
            className="absolute left-(--memorilo-outline-line-x) w-px bg-border/70"
            style={{
              top: 0,
              height: 'calc(var(--memorilo-outline-top-offset) + var(--memorilo-outline-first-line)/2 - var(--memorilo-outline-dot-size)/2)',
            }}
          />
        )}
        <span className="absolute top-[calc(var(--memorilo-outline-top-offset)+var(--memorilo-outline-first-line)/2)] left-(--memorilo-outline-dot-x) -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-auto">
          <AnimatePresence>
            {showButtons && (
              <motion.div
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                className="absolute right-full top-1/2 -translate-y-1/2 mr-2 flex gap-1 items-center"
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
            <span className="rounded-full bg-foreground" style={{ width: 'var(--memorilo-outline-dot-size)', height: 'var(--memorilo-outline-dot-size)' }} />
          </span>
        </span>

        <span
          className="absolute left-(--memorilo-outline-line-x) w-px bg-border/70"
          style={{
            top: 'calc(var(--memorilo-outline-top-offset) + var(--memorilo-outline-first-line)/2 + var(--memorilo-outline-dot-size)/2)',
            bottom: hasIndentBelow ? 0 : '0.5rem',
          }}
        />
      </div>
      <IndentChildCollapseContext value={childCollapsed}>
        {props.children}
      </IndentChildCollapseContext>
    </motion.div>
  )
}
