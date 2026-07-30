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
  CheckCircle2,
  ChevronDown,
  Circle,
  CircleDot,
  Clock3,
  FileText,
  Network,
  PanelLeft,
  PanelRight,
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

const inspectorSpring = {
  bounce: 0,
  type: 'spring',
  visualDuration: 0.28,
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

type TopicStatus = 'current' | 'due' | 'learned' | 'new'

interface TopicItem {
  depth: 0 | 1 | 2
  hasChildren?: boolean
  id: string
  label: string
  status: TopicStatus
}

const topicItems: readonly TopicItem[] = [
  {
    depth: 0,
    hasChildren: true,
    id: 'editor-thinking',
    label: 'The editor that thinks like you',
    status: 'current',
  },
  { depth: 1, id: 'text-shines', label: 'Text that shines', status: 'learned' },
  {
    depth: 1,
    hasChildren: true,
    id: 'lists-organize',
    label: 'Lists that organize',
    status: 'due',
  },
  { depth: 2, id: 'done-feels-good', label: 'Done feels good', status: 'learned' },
  { depth: 2, id: 'doing-clock', label: 'Doing keeps the clock running', status: 'due' },
  { depth: 1, id: 'code-inspires', label: 'Code that inspires', status: 'new' },
]

const topicDepthStyles = [
  editorRouteStyles.topicDepth0,
  editorRouteStyles.topicDepth1,
  editorRouteStyles.topicDepth2,
] as const

function TopicStatusIcon({ status }: { status: TopicStatus }) {
  if (status === 'current') {
    return (
      <span {...stylex.props(editorRouteStyles.topicStatus, editorRouteStyles.topicStatusCurrent)} title="Current topic">
        <CircleDot aria-label="Current topic" size={13} strokeWidth={2} />
      </span>
    )
  }
  if (status === 'due') {
    return (
      <span {...stylex.props(editorRouteStyles.topicStatus, editorRouteStyles.topicStatusDue)} title="Due for review">
        <Clock3 aria-label="Due for review" size={13} strokeWidth={1.9} />
      </span>
    )
  }
  if (status === 'learned') {
    return (
      <span {...stylex.props(editorRouteStyles.topicStatus, editorRouteStyles.topicStatusLearned)} title="Reviewed">
        <CheckCircle2 aria-label="Reviewed" size={13} strokeWidth={1.9} />
      </span>
    )
  }
  return (
    <span {...stylex.props(editorRouteStyles.topicStatus)} title="Not scheduled">
      <Circle aria-label="Not scheduled" size={12} strokeWidth={1.7} />
    </span>
  )
}

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
  const [inspectorVisible, setInspectorVisible] = useState(true)
  const [selectedTopicId, setSelectedTopicId] = useState('editor-thinking')
  const shouldReduceMotion = useReducedMotion()
  const transition = shouldReduceMotion ? { duration: 0 } : sidebarSpring
  const inspectorTransition = shouldReduceMotion ? { duration: 0 } : inspectorSpring

  return (
    <main {...stylex.props(editorRouteStyles.page)}>
      <AnimatePresence initial={false}>
        {sidebarVisible
          ? (
              <motion.aside
                {...stylex.props(editorRouteStyles.sidebar)}
                animate={{ marginLeft: 8, opacity: 1, width: 248, x: 0 }}
                aria-label="Workspace navigation"
                exit={{ marginLeft: 0, opacity: 0, width: 0, x: -18 }}
                initial={{ marginLeft: 0, opacity: 0, width: 0, x: -18 }}
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
      <AnimatePresence initial={false}>
        {inspectorVisible
          ? (
              <motion.aside
                {...stylex.props(editorRouteStyles.inspector)}
                animate={{ opacity: 1, width: 292, x: 0 }}
                aria-label="Note inspector"
                exit={{ opacity: 0, width: 0, x: 18 }}
                initial={{ opacity: 0, width: 0, x: 18 }}
                transition={inspectorTransition}
              >
                <header {...stylex.props(editorRouteStyles.inspectorTitlebar)} data-window-drag="">
                  <div {...stylex.props(editorRouteStyles.inspectorTitleGroup)}>
                    <h1 {...stylex.props(editorRouteStyles.inspectorTitle)}>Topics</h1>
                    <span {...stylex.props(editorRouteStyles.inspectorCount)}>6</span>
                  </div>
                </header>
                <div {...stylex.props(editorRouteStyles.inspectorContent)}>
                  <section {...stylex.props(editorRouteStyles.inspectorSection)} aria-labelledby="topic-structure-heading">
                    <div {...stylex.props(editorRouteStyles.inspectorSectionHeading)}>
                      <h2 id="topic-structure-heading" {...stylex.props(editorRouteStyles.inspectorSectionTitle)}>
                        Structure
                      </h2>
                      <span {...stylex.props(editorRouteStyles.inspectorSectionMeta)}>2 due</span>
                    </div>
                    <div {...stylex.props(editorRouteStyles.topicTree)}>
                      {topicItems.map(topic => (
                        <button
                          key={topic.id}
                          {...stylex.props(
                            editorRouteStyles.topicRow,
                            topicDepthStyles[topic.depth],
                            selectedTopicId === topic.id && editorRouteStyles.topicRowSelected,
                          )}
                          aria-current={selectedTopicId === topic.id ? 'true' : undefined}
                          type="button"
                          onClick={() => setSelectedTopicId(topic.id)}
                        >
                          <span {...stylex.props(editorRouteStyles.topicDisclosure)}>
                            {topic.hasChildren
                              ? <ChevronDown aria-hidden="true" size={12} strokeWidth={1.8} />
                              : <span {...stylex.props(editorRouteStyles.topicLeaf)} />}
                          </span>
                          <span {...stylex.props(editorRouteStyles.topicLabel)}>{topic.label}</span>
                          <TopicStatusIcon status={topic.status} />
                        </button>
                      ))}
                    </div>
                  </section>
                  <section
                    {...stylex.props(editorRouteStyles.inspectorSection, editorRouteStyles.learningSection)}
                    aria-labelledby="learning-status-heading"
                  >
                    <div {...stylex.props(editorRouteStyles.inspectorSectionHeading)}>
                      <h2 id="learning-status-heading" {...stylex.props(editorRouteStyles.inspectorSectionTitle)}>
                        Learning
                      </h2>
                      <span {...stylex.props(editorRouteStyles.learningState)}>
                        <span {...stylex.props(editorRouteStyles.learningStateDot)} />
                        Reviewing
                      </span>
                    </div>
                    <dl {...stylex.props(editorRouteStyles.learningDetails)}>
                      <div {...stylex.props(editorRouteStyles.learningDetail)}>
                        <dt {...stylex.props(editorRouteStyles.learningTerm)}>Next review</dt>
                        <dd {...stylex.props(editorRouteStyles.learningValue, editorRouteStyles.learningValueDue)}>Today</dd>
                      </div>
                      <div {...stylex.props(editorRouteStyles.learningDetail)}>
                        <dt {...stylex.props(editorRouteStyles.learningTerm)}>Stability</dt>
                        <dd {...stylex.props(editorRouteStyles.learningValue)}>3.2 days</dd>
                      </div>
                      <div {...stylex.props(editorRouteStyles.learningDetail)}>
                        <dt {...stylex.props(editorRouteStyles.learningTerm)}>Priority</dt>
                        <dd {...stylex.props(editorRouteStyles.learningValue)}>Normal</dd>
                      </div>
                    </dl>
                    <div {...stylex.props(editorRouteStyles.learningProgressHeader)}>
                      <span>Reviewed</span>
                      <span>3 of 6</span>
                    </div>
                    <div
                      {...stylex.props(editorRouteStyles.learningProgressTrack)}
                      aria-label="3 of 6 topics reviewed"
                      aria-valuemax={6}
                      aria-valuemin={0}
                      aria-valuenow={3}
                      role="progressbar"
                    >
                      <div {...stylex.props(editorRouteStyles.learningProgressFill)} />
                    </div>
                  </section>
                </div>
              </motion.aside>
            )
          : null}
      </AnimatePresence>
      <button
        {...stylex.props(editorRouteStyles.inspectorToggle)}
        aria-label={inspectorVisible ? 'Hide Note Inspector' : 'Show Note Inspector'}
        data-window-no-drag=""
        title={inspectorVisible ? 'Hide Note Inspector' : 'Show Note Inspector'}
        type="button"
        onClick={() => setInspectorVisible(visible => !visible)}
      >
        <PanelRight aria-hidden="true" size={17} strokeWidth={1.8} />
      </button>
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
