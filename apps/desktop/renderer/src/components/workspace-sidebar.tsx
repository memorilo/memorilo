import type { LucideIcon } from 'lucide-react'
import * as stylex from '@stylexjs/stylex'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  CalendarDays,
  ChevronDown,
  Clock3,
  Files,
  FileText,
  PanelLeft,
} from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useCallback, useId, useRef, useState } from 'react'

import { workspaceSidebarStyles } from './workspace-sidebar.stylex'

const sidebarSpring = {
  bounce: 0.12,
  type: 'spring',
  visualDuration: 0.3,
} as const

const disclosureSpring = {
  bounce: 0,
  type: 'spring',
  visualDuration: 0.22,
} as const

interface SourceItemProps {
  icon: LucideIcon
  label: string
  selected?: boolean
}

const navigationItems: readonly SourceItemProps[] = [
  { icon: CalendarDays, label: 'Journals', selected: true },
  { icon: Files, label: 'Pages' },
]

const favoriteItems: readonly SourceItemProps[] = [
  { icon: FileText, label: 'Designing Fluid Interfaces' },
  { icon: FileText, label: 'How memory changes' },
]

const recentItems: readonly SourceItemProps[] = [
  { icon: Clock3, label: 'Progressive reading' },
  { icon: Clock3, label: 'Ideas for Memorilo' },
  { icon: Clock3, label: 'The extended mind' },
]

const sourceRowHeight = 33
const sourceListMaxHeight = sourceRowHeight * 6

function estimateSourceRowSize() {
  return sourceRowHeight
}

function SourceItem({ icon: Icon, label, selected = false }: SourceItemProps) {
  return (
    <button
      {...stylex.props(workspaceSidebarStyles.sourceItem, selected && workspaceSidebarStyles.sourceItemSelected)}
      aria-current={selected ? 'page' : undefined}
      type="button"
    >
      <Icon
        {...stylex.props(workspaceSidebarStyles.sourceIcon, selected && workspaceSidebarStyles.sourceIconSelected)}
        aria-hidden="true"
        strokeWidth={1.8}
      />
      <span {...stylex.props(workspaceSidebarStyles.sourceLabel, selected && workspaceSidebarStyles.sourceLabelSelected)}>
        {label}
      </span>
    </button>
  )
}

function VirtualizedSourceList({
  headingId,
  items,
}: {
  headingId: string
  items: readonly SourceItemProps[]
}) {
  const scrollElementRef = useRef<HTMLDivElement>(null)
  const getItemKey = useCallback((index: number) => {
    const item = items[index]
    if (!item)
      throw new RangeError(`Virtual source item ${index} is outside the list`)
    return item.label
  }, [items])
  const virtualizer = useVirtualizer({
    count: items.length,
    estimateSize: estimateSourceRowSize,
    getItemKey,
    getScrollElement: () => scrollElementRef.current,
    overscan: 3,
  })

  return (
    <div
      ref={scrollElementRef}
      {...stylex.props(workspaceSidebarStyles.virtualSourceViewport)}
      aria-labelledby={headingId}
      role="list"
      style={{ height: Math.min(items.length * sourceRowHeight, sourceListMaxHeight) }}
    >
      <div
        {...stylex.props(workspaceSidebarStyles.virtualSourceSizer)}
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const item = items[virtualItem.index]
          if (!item)
            throw new RangeError(`Virtual source item ${virtualItem.index} is outside the list`)
          return (
            <div
              key={virtualItem.key}
              {...stylex.props(workspaceSidebarStyles.virtualSourceItem)}
              role="listitem"
              style={{ transform: `translateY(${virtualItem.start}px)` }}
            >
              <SourceItem {...item} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SourceGroup({ items, label }: { items: readonly SourceItemProps[], label: string }) {
  const [expanded, setExpanded] = useState(true)
  const shouldReduceMotion = useReducedMotion()
  const headingId = useId()
  const transition = shouldReduceMotion ? { duration: 0 } : disclosureSpring

  return (
    <section {...stylex.props(workspaceSidebarStyles.sourceGroup)}>
      <button
        id={headingId}
        {...stylex.props(workspaceSidebarStyles.groupHeading)}
        aria-expanded={expanded}
        type="button"
        onClick={() => setExpanded(current => !current)}
      >
        <span>{label}</span>
        <motion.span
          {...stylex.props(workspaceSidebarStyles.disclosureIcon)}
          animate={{ rotate: expanded ? 0 : -90 }}
          initial={false}
          transition={transition}
        >
          <ChevronDown aria-hidden="true" size={14} strokeWidth={2} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {expanded
          ? (
              <motion.div
                {...stylex.props(workspaceSidebarStyles.animatedSourceList)}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                initial={{ height: 0, opacity: 0 }}
                transition={transition}
              >
                <VirtualizedSourceList headingId={headingId} items={items} />
              </motion.div>
            )
          : null}
      </AnimatePresence>
    </section>
  )
}

export function WorkspaceSidebar({ onToggle, visible }: { onToggle: () => void, visible: boolean }) {
  const shouldReduceMotion = useReducedMotion()
  const transition = shouldReduceMotion ? { duration: 0 } : sidebarSpring

  return (
    <>
      <AnimatePresence initial={false}>
        {visible
          ? (
              <motion.aside
                {...stylex.props(workspaceSidebarStyles.sidebar)}
                animate={{ marginLeft: 8, opacity: 1, width: 248, x: 0 }}
                aria-label="Workspace navigation"
                exit={{ marginLeft: 0, opacity: 0, width: 0, x: -18 }}
                initial={{ marginLeft: 0, opacity: 0, width: 0, x: -18 }}
                transition={transition}
              >
                <nav {...stylex.props(workspaceSidebarStyles.content)}>
                  <section {...stylex.props(workspaceSidebarStyles.sourceGroup)}>
                    <h2 {...stylex.props(workspaceSidebarStyles.navigationHeading)}>Navigation</h2>
                    <div {...stylex.props(workspaceSidebarStyles.sourceList)}>
                      {navigationItems.map(item => <SourceItem key={item.label} {...item} />)}
                    </div>
                  </section>
                  <SourceGroup items={favoriteItems} label="Favorites" />
                  <SourceGroup items={recentItems} label="Recent" />
                </nav>
              </motion.aside>
            )
          : null}
      </AnimatePresence>
      <motion.button
        {...stylex.props(workspaceSidebarStyles.toggle)}
        animate={{ left: visible ? 217 : 80 }}
        aria-label={visible ? 'Hide Sidebar' : 'Show Sidebar'}
        data-window-no-drag=""
        initial={false}
        title={visible ? 'Hide Sidebar' : 'Show Sidebar'}
        transition={transition}
        type="button"
        onClick={onToggle}
      >
        <PanelLeft aria-hidden="true" size={17} strokeWidth={1.8} />
      </motion.button>
    </>
  )
}
