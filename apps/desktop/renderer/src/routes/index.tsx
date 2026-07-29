import type { DesktopNote } from '@memorilo/desktop-preload'
import type {
  EditorNote,
  EditorNoteChange,
  EditorTopicDocument,
} from '@memorilo/editor'
import type { LucideIcon } from 'lucide-react'
import { createEditorNote, demoEditorAdapters, Editor } from '@memorilo/editor'
import * as stylex from '@stylexjs/stylex'
import { createFileRoute } from '@tanstack/react-router'
import {
  BookOpenCheck,
  CalendarDays,
  ChevronDown,
  Clock3,
  FileText,
  Network,
  PanelLeft,
  Search,
} from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { editorRouteStyles } from './-index.stylex'

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

const saveDelay = 250

interface SourceItemProps {
  icon: LucideIcon
  label: string
  meta?: string
  selected?: boolean
}

const navigationItems: readonly SourceItemProps[] = [
  { icon: CalendarDays, label: 'Journals', selected: true },
  { icon: Search, label: 'Search' },
  { icon: BookOpenCheck, label: 'Learning', meta: '12' },
  { icon: Network, label: 'Graph' },
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

function SourceItem({ icon: Icon, label, meta, selected = false }: SourceItemProps) {
  return (
    <button
      {...stylex.props(editorRouteStyles.sourceItem, selected && editorRouteStyles.sourceItemSelected)}
      aria-current={selected ? 'page' : undefined}
      type="button"
    >
      <Icon
        {...stylex.props(editorRouteStyles.sourceIcon, selected && editorRouteStyles.sourceIconSelected)}
        aria-hidden="true"
        strokeWidth={1.8}
      />
      <span {...stylex.props(editorRouteStyles.sourceLabel, selected && editorRouteStyles.sourceLabelSelected)}>
        {label}
      </span>
      {meta ? <span {...stylex.props(editorRouteStyles.sourceMeta)}>{meta}</span> : null}
    </button>
  )
}

function SourceGroup({ items, label }: { items: readonly SourceItemProps[], label: string }) {
  const [expanded, setExpanded] = useState(true)
  const shouldReduceMotion = useReducedMotion()
  const transition = shouldReduceMotion ? { duration: 0 } : disclosureSpring

  return (
    <section {...stylex.props(editorRouteStyles.sourceGroup)}>
      <button
        {...stylex.props(editorRouteStyles.groupHeading)}
        aria-expanded={expanded}
        type="button"
        onClick={() => setExpanded(current => !current)}
      >
        <span>{label}</span>
        <motion.span
          {...stylex.props(editorRouteStyles.disclosureIcon)}
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
                {...stylex.props(editorRouteStyles.sourceList, editorRouteStyles.animatedSourceList)}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                initial={{ height: 0, opacity: 0 }}
                transition={transition}
              >
                {items.map(item => <SourceItem key={item.label} {...item} />)}
              </motion.div>
            )
          : null}
      </AnimatePresence>
    </section>
  )
}

interface OpenEditorNote {
  note: EditorNote
  stored: DesktopNote
  topic: EditorTopicDocument
}

function OpenedTopicEditor({ opened, saveError }: { opened: OpenEditorNote, saveError: string | null }) {
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const shouldReduceMotion = useReducedMotion()
  const transition = shouldReduceMotion ? { duration: 0 } : sidebarSpring

  return (
    <main {...stylex.props(editorRouteStyles.page)}>
      <AnimatePresence initial={false}>
        {sidebarVisible
          ? (
              <motion.aside
                {...stylex.props(editorRouteStyles.sidebar)}
                animate={{ marginLeft: 8, minWidth: 248, opacity: 1, width: 248, x: 0 }}
                aria-label="Workspace navigation"
                exit={{ marginLeft: 0, minWidth: 0, opacity: 0, width: 0, x: -18 }}
                initial={{ marginLeft: 0, minWidth: 0, opacity: 0, width: 0, x: -18 }}
                transition={transition}
              >
                <div {...stylex.props(editorRouteStyles.sidebarTitlebar)} data-window-drag="" />
                <nav {...stylex.props(editorRouteStyles.sidebarContent)}>
                  <section {...stylex.props(editorRouteStyles.sourceGroup)}>
                    <h2 {...stylex.props(editorRouteStyles.navigationHeading)}>Navigation</h2>
                    <div {...stylex.props(editorRouteStyles.sourceList)}>
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
        {...stylex.props(editorRouteStyles.sidebarToggle)}
        animate={{ left: sidebarVisible ? 217 : 80 }}
        aria-label={sidebarVisible ? 'Hide Sidebar' : 'Show Sidebar'}
        data-window-no-drag=""
        initial={false}
        title={sidebarVisible ? 'Hide Sidebar' : 'Show Sidebar'}
        transition={transition}
        type="button"
        onClick={() => setSidebarVisible(visible => !visible)}
      >
        <PanelLeft aria-hidden="true" size={17} strokeWidth={1.8} />
      </motion.button>
      <section {...stylex.props(editorRouteStyles.workspace)} aria-label={opened.stored.title}>
        {saveError
          ? (
              <div {...stylex.props(editorRouteStyles.saveError)} aria-live="polite" role="status">
                Failed to save Note:
                {saveError}
              </div>
            )
          : null}
        <Editor
          adapters={demoEditorAdapters}
          topic={opened.topic}
        />
      </section>
    </main>
  )
}

function EditorRoute() {
  const [opened, setOpened] = useState<OpenEditorNote | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const noteRef = useRef<EditorNote | null>(null)
  const pendingChangesRef = useRef<EditorNoteChange[]>([])
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const persistingRef = useRef(false)
  const flushPendingRef = useRef<(reportError: boolean) => void>(() => undefined)

  const flushPending = useCallback((reportError: boolean) => {
    const note = noteRef.current
    if (!note || persistingRef.current || pendingChangesRef.current.length === 0)
      return
    if (saveTimerRef.current !== null) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }

    const changes = pendingChangesRef.current.splice(0)
    persistingRef.current = true

    void (async () => {
      try {
        const receipt = await window.desktop.saveNoteUpdates({
          noteId: note.id,
          updates: changes.map(change => change.update),
        })
        setOpened(current => current
          ? {
              ...current,
              stored: {
                ...current.stored,
                updatedAt: receipt.updatedAt,
              },
            }
          : current)
        if (reportError)
          setSaveError(null)
      }
      catch (error) {
        pendingChangesRef.current.unshift(...changes)
        if (reportError)
          setSaveError(error instanceof Error ? error.message : String(error))
        else
          console.error('Failed to flush the current Note', error)
      }
      finally {
        persistingRef.current = false
        if (pendingChangesRef.current.length > 0 && saveTimerRef.current === null) {
          saveTimerRef.current = setTimeout(() => {
            saveTimerRef.current = null
            flushPendingRef.current(true)
          }, saveDelay)
        }
      }
    })()
  }, [])
  flushPendingRef.current = flushPending

  const handleNoteChange = useCallback((change: EditorNoteChange) => {
    pendingChangesRef.current.push(change)
    if (saveTimerRef.current !== null)
      clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null
      flushPendingRef.current(true)
    }, saveDelay)
  }, [])

  useEffect(() => {
    let active = true
    let unsubscribe: (() => void) | undefined

    void window.desktop.openMostRecentNote().then(async (stored) => {
      if (!active)
        return
      const note = createEditorNote({
        id: stored.id,
        snapshot: stored.snapshot,
        title: stored.title,
      })
      if (!active)
        return

      const topic = note.getEntries().find(entry => entry.kind === 'topic')
      if (!topic)
        throw new Error(`Note ${note.id} does not contain a Topic`)
      noteRef.current = note
      unsubscribe = note.subscribe(handleNoteChange)
      setOpened({
        note,
        stored,
        topic: note.getTopic(topic.id),
      })
    }, (error) => {
      if (active)
        setLoadError(error instanceof Error ? error.message : String(error))
    }).catch((error) => {
      if (active)
        setLoadError(error instanceof Error ? error.message : String(error))
    })

    return () => {
      active = false
      unsubscribe?.()
      if (saveTimerRef.current !== null) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
      flushPendingRef.current(false)
    }
  }, [handleNoteChange])

  if (loadError) {
    return (
      <main {...stylex.props(editorRouteStyles.page)} role="alert">
        Failed to open Note:
        {loadError}
      </main>
    )
  }
  if (!opened)
    return <main {...stylex.props(editorRouteStyles.page)} role="status">Opening Note…</main>

  return <OpenedTopicEditor opened={opened} saveError={saveError} />
}

export const Route = createFileRoute('/')({ component: EditorRoute })
