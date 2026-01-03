import type { CSSProperties } from 'react'
import type { RenderElementProps } from 'slate-react'
import { ChevronDownIcon } from '@memorilo/components/ui/animiated-icons/chevron-down'
import { GripVerticalIcon } from '@memorilo/components/ui/animiated-icons/grip-vertical'
import { Button } from '@memorilo/components/ui/button'
import { parsePositiveInt } from '@memorilo/utils'
import { Array as Arr, Match, Option, pipe } from 'effect'
import { attempt } from 'es-toolkit'
import { AnimatePresence, motion } from 'motion/react'
import { use, useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Node, Element as SlateElement } from 'slate'
import { ReactEditor, useFocused, useSelected, useSlateSelector, useSlateStatic } from 'slate-react'
import { isIndent } from '../../../lib/element-type'
import { IndentChildCollapseContext, IndentDragContext, IndentEnableContext, IndentHoverContext } from './contexts'

const MotionButton = motion(Button)

interface HeaderMeasurements {
  firstLineHeight?: string
  headerHeight?: string
}

function getHeaderElement(element: SlateElement) {
  return pipe(element.children, Arr.head, Option.filter(SlateElement.isElement))
}

function hasIndentChild(element: SlateElement): boolean {
  return Arr.some(
    element.children,
    child => SlateElement.isElement(child) && isIndent(child),
  )
}

function getOutlineMetrics(element: SlateElement) {
  return pipe(
    getHeaderElement(element),
    Option.map(header => Match.value(header.type).pipe(
      Match.when('h1', () => ({ firstLineHeight: '2.25rem', topOffset: '0rem' })),
      Match.when('h2', () => ({ firstLineHeight: '2rem', topOffset: '0rem' })),
      Match.when('h3', () => ({ firstLineHeight: '1.75rem', topOffset: '0rem' })),
      Match.when('h4', () => ({ firstLineHeight: '1.75rem', topOffset: '0rem' })),
      Match.when('h5', () => ({ firstLineHeight: '1.5rem', topOffset: '0rem' })),
      Match.when('h6', () => ({ firstLineHeight: '1.5rem', topOffset: '0rem' })),
      Match.when('codeblock', () => ({ firstLineHeight: '1.25rem', topOffset: '0.5rem' })),
      Match.when('todo', () => ({ firstLineHeight: '1.5rem', topOffset: '0.25rem' })),
      Match.orElse(() => ({ firstLineHeight: '1.5rem', topOffset: '0rem' })),
    )),
    Option.getOrElse(() => ({ firstLineHeight: '1.5rem', topOffset: '0rem' })),
  )
}

function measureHeaderMetrics(editor: ReactEditor, element: SlateElement): HeaderMeasurements {
  return pipe(
    getHeaderElement(element),
    Option.flatMap((header) => {
      const [domError, domNode] = attempt(() => ReactEditor.toDOMNode(editor, header))
      if (domError || !(domNode instanceof HTMLElement))
        return Option.none()

      const style = window.getComputedStyle(domNode)
      const lineHeight = pipe(
        parsePositiveInt(style.lineHeight),
        Option.orElse(() =>
          pipe(
            parsePositiveInt(style.fontSize),
            Option.map(fontSize => fontSize * 1.2),
          ),
        ),
      )
      const headerHeight = parsePositiveInt(String(domNode.getBoundingClientRect().height))

      return Option.some({
        firstLineHeight: Option.getOrUndefined(pipe(lineHeight, Option.map(value => `${value}px`))),
        headerHeight: Option.getOrUndefined(pipe(headerHeight, Option.map(value => `${value}px`))),
      })
    }),
    Option.getOrElse(() => ({})),
  )
}

export function Indent(props: RenderElementProps) {
  const { t } = useTranslation('app')
  const { collapsed, setCollapsed } = use(IndentChildCollapseContext)
  const enabled = use(IndentEnableContext)
  const drag = use(IndentDragContext)
  const { hoveredPath, setHoveredPath } = use(IndentHoverContext)
  const [childExpanded, setChildExpanded] = useState(true)
  const expandable = props.element.children.length > 1
  const isFocused = useFocused()
  const isSelected = useSelected()
  const editor = useSlateStatic()
  const [measuredFirstLineHeight, setMeasuredFirstLineHeight] = useState<string>()
  const [measuredHeaderHeight, setMeasuredHeaderHeight] = useState<string>()
  const hasIndentChildren = useMemo(() => hasIndentChild(props.element), [props.element])

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
    const { firstLineHeight: nextMeasuredFirstLineHeight, headerHeight: nextMeasuredHeaderHeight } = measureHeaderMetrics(editor, props.element)

    queueMicrotask(() => {
      if (cancelled)
        return
      setMeasuredFirstLineHeight((prev) => {
        if (prev === nextMeasuredFirstLineHeight)
          return prev
        return nextMeasuredFirstLineHeight
      })
      setMeasuredHeaderHeight((prev) => {
        if (prev === nextMeasuredHeaderHeight)
          return prev
        return nextMeasuredHeaderHeight
      })
    })

    return () => {
      cancelled = true
    }
  }, [editor, enabled, props.element])

  const indentPathKey = useSlateSelector((editor) => {
    try {
      return ReactEditor.findPath(editor, props.element).join(',')
    }
    catch {
      return null
    }
  })
  const showButtons = hoveredPath === indentPathKey
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
    const base = getOutlineMetrics(props.element)
    const firstLineHeight = measuredFirstLineHeight ?? base.firstLineHeight
    return {
      ...base,
      firstLineHeight,
      headerHeight: measuredHeaderHeight ?? firstLineHeight,
    }
  }, [measuredFirstLineHeight, measuredHeaderHeight, props.element])

  const showLines = hasIndentChildren

  const getClosestIndentPath = useCallback((target: EventTarget | null) => {
    if (!(target instanceof HTMLElement))
      return null
    return target.closest('[data-indent-path]')?.getAttribute('data-indent-path') ?? null
  }, [])

  const onPointerMove = useCallback((event: React.PointerEvent) => {
    if (!indentPathKey)
      return
    const closestPath = getClosestIndentPath(event.target)
    if (closestPath === indentPathKey)
      setHoveredPath(indentPathKey)
  }, [getClosestIndentPath, indentPathKey, setHoveredPath])

  const onPointerLeave = useCallback((event: React.PointerEvent) => {
    if (!indentPathKey || hoveredPath !== indentPathKey)
      return
    const nextPath = getClosestIndentPath(event.relatedTarget)
    setHoveredPath(nextPath)
  }, [getClosestIndentPath, hoveredPath, indentPathKey, setHoveredPath])

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
        'paddingLeft': 'var(--memorilo-outline-indent)',
        '--memorilo-outline-first-line': metrics.firstLineHeight,
        '--memorilo-outline-header-height': metrics.headerHeight,
        '--memorilo-outline-top-offset': metrics.topOffset,
      } as CSSProperties}
      data-indent-path={indentPathKey ?? undefined}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
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
        {showLines && (
          <span
            className="absolute left-(--memorilo-outline-line-x) bottom-0 w-px bg-border/70"
            style={{
              top: 'calc(var(--memorilo-outline-top-offset) + var(--memorilo-outline-header-height))',
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
                  aria-label={t('editor.indent.dragNode')}
                  title={t('editor.indent.dragNode')}
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
            <span
              className="rounded-full bg-foreground transition-shadow hover:shadow-[0_0_0_4px_rgba(0,0,0,0.2)]"
              style={{ width: 'var(--memorilo-outline-dot-size)', height: 'var(--memorilo-outline-dot-size)' }}
            />
          </span>
        </span>

      </div>
      <IndentChildCollapseContext value={childCollapsed}>
        {props.children}
      </IndentChildCollapseContext>
    </motion.div>
  )
}
