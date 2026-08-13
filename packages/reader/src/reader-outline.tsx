import type { UIEvent } from 'react'
import type { ReaderOutlineItem } from './types'
import * as stylex from '@stylexjs/stylex'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { readerOutlineStyles as readerStyles } from './reader-outline.stylex'

interface VisibleOutlineItem {
  depth: number
  item: ReaderOutlineItem
  positionInSet: number
  setSize: number
}

const outlineRowHeight = 29
const outlineOverscan = 8
const outlineTopInset = 7
const outlineBottomInset = 10

function normalizedOutlineHref(href: string | undefined): string | undefined {
  if (!href)
    return undefined
  return href.split(/[?#]/, 1)[0]
}

function activeOutlineItemId(items: readonly ReaderOutlineItem[], currentHref: string | undefined): string | undefined {
  const normalizedCurrentHref = normalizedOutlineHref(currentHref)
  if (!normalizedCurrentHref)
    return undefined
  for (const item of items) {
    if (normalizedOutlineHref(item.href) === normalizedCurrentHref)
      return item.id
    const childMatch = activeOutlineItemId(item.children, currentHref)
    if (childMatch)
      return childMatch
  }
  return undefined
}

function visibleOutlineItems(
  items: readonly ReaderOutlineItem[],
  expanded: ReadonlySet<string>,
  depth = 0,
  result: VisibleOutlineItem[] = [],
): VisibleOutlineItem[] {
  items.forEach((item, index) => {
    result.push({ depth, item, positionInSet: index + 1, setSize: items.length })
    if (item.children.length > 0 && expanded.has(item.id))
      visibleOutlineItems(item.children, expanded, depth + 1, result)
  })
  return result
}

export function ReaderOutline({
  currentHref,
  items,
  onNavigate,
}: {
  currentHref: string | undefined
  items: readonly ReaderOutlineItem[]
  onNavigate: (itemId: string) => void
}) {
  const { t } = useTranslation('common')
  const outlineViewportRef = useRef<HTMLDivElement | null>(null)
  const scrollFrameRef = useRef<number | null>(null)
  const pendingScrollTopRef = useRef(0)
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(items.filter(item => item.children.length > 0).map(item => item.id)),
  )
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(480)
  const activeItemId = useMemo(() => activeOutlineItemId(items, currentHref), [currentHref, items])
  const visibleItems = useMemo(() => visibleOutlineItems(items, expanded), [expanded, items])
  const startIndex = Math.max(0, Math.floor((scrollTop - outlineTopInset) / outlineRowHeight) - outlineOverscan)
  const endIndex = Math.min(
    visibleItems.length,
    Math.ceil((scrollTop + viewportHeight - outlineTopInset) / outlineRowHeight) + outlineOverscan,
  )
  const renderedItems = visibleItems.slice(startIndex, endIndex)
  const outlineHeight = outlineTopInset + visibleItems.length * outlineRowHeight + outlineBottomInset

  useEffect(() => {
    const viewport = outlineViewportRef.current
    if (!viewport)
      return
    const observer = new ResizeObserver(([entry]) => {
      if (entry)
        setViewportHeight(entry.contentRect.height)
    })
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [])

  useEffect(() => () => {
    if (scrollFrameRef.current !== null)
      cancelAnimationFrame(scrollFrameRef.current)
  }, [])

  const toggle = (itemId: string) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(itemId))
        next.delete(itemId)
      else
        next.add(itemId)
      return next
    })
  }

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    pendingScrollTopRef.current = event.currentTarget.scrollTop
    if (scrollFrameRef.current !== null)
      return
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null
      setScrollTop(pendingScrollTopRef.current)
    })
  }

  return (
    <div
      ref={outlineViewportRef}
      {...stylex.props(readerStyles.outlineList)}
      role="tree"
      onScroll={handleScroll}
    >
      <div {...stylex.props(readerStyles.outlineSpacer)} style={{ height: outlineHeight }}>
        {renderedItems.map(({ depth, item, positionInSet, setSize }, relativeIndex) => {
          const hasChildren = item.children.length > 0
          const isExpanded = expanded.has(item.id)
          const isActive = item.id === activeItemId
          const itemIndex = startIndex + relativeIndex
          return (
            <div
              key={item.id}
              {...stylex.props(readerStyles.outlineVirtualRow)}
              aria-expanded={hasChildren ? isExpanded : undefined}
              aria-level={depth + 1}
              aria-posinset={positionInSet}
              aria-setsize={setSize}
              role="treeitem"
              style={{ top: outlineTopInset + itemIndex * outlineRowHeight }}
            >
              <div
                {...stylex.props(readerStyles.outlineRow, isActive && readerStyles.outlineRowActive)}
                style={{ paddingLeft: 8 + depth * 14 }}
              >
                {hasChildren
                  ? (
                      <button
                        {...stylex.props(readerStyles.outlineDisclosure)}
                        aria-label={isExpanded
                          ? t('reader.collapseOutlineItem', { label: item.label })
                          : t('reader.expandOutlineItem', { label: item.label })}
                        type="button"
                        onClick={() => toggle(item.id)}
                      >
                        {isExpanded
                          ? <ChevronDown aria-hidden="true" size={13} strokeWidth={1.8} />
                          : <ChevronRight aria-hidden="true" size={13} strokeWidth={1.8} />}
                      </button>
                    )
                  : <span {...stylex.props(readerStyles.outlineDisclosureSpacer)} />}
                {item.navigable
                  ? (
                      <button
                        {...stylex.props(readerStyles.outlineTarget)}
                        aria-current={isActive ? 'location' : undefined}
                        type="button"
                        onClick={() => onNavigate(item.id)}
                      >
                        {item.label}
                      </button>
                    )
                  : <span {...stylex.props(readerStyles.outlineLabel)}>{item.label}</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
