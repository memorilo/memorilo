import type { DesktopNote } from '@memorilo/desktop-preload'
import type {
  EditorNote,
  EditorNoteChange,
  EditorTopicDocument,
} from '@memorilo/editor'
import { createEditorNote, demoEditorAdapters, Editor } from '@memorilo/editor'
import * as stylex from '@stylexjs/stylex'
import {
  CheckCircle2,
  ChevronDown,
  Circle,
  CircleDot,
  Clock3,
  PanelRight,
} from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { usePageTitlebar } from '../components/page-titlebar'
import { editorRouteStyles } from './-note.stylex'

const inspectorSpring = {
  bounce: 0,
  type: 'spring',
  visualDuration: 0.28,
} as const

const saveDelay = 250

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

interface OpenEditorNote {
  note: EditorNote
  stored: DesktopNote
  topic: EditorTopicDocument
}

function OpenedTopicEditor({
  focusBlockId,
  onRenameNote,
  opened,
  saveError,
}: {
  focusBlockId?: string
  onRenameNote: (note: EditorNote, title: string) => Promise<{ error?: string } | void>
  opened: OpenEditorNote
  saveError: string | null
}) {
  const [inspectorVisible, setInspectorVisible] = useState(true)
  const [selectedTopicId, setSelectedTopicId] = useState('editor-thinking')
  const shouldReduceMotion = useReducedMotion()
  const inspectorTransition = shouldReduceMotion ? { duration: 0 } : inspectorSpring
  const toggleInspector = useCallback(() => setInspectorVisible(visible => !visible), [])
  const renameNote = useCallback((title: string) => onRenameNote(opened.note, title), [onRenameNote, opened.note])
  const titlebar = useMemo(() => ({
    onRenameTitle: renameNote,
    title: opened.stored.title,
  }), [opened.stored.title, renameNote])
  usePageTitlebar(titlebar)

  return (
    <main {...stylex.props(editorRouteStyles.page)}>
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
          focus={focusBlockId === undefined ? undefined : { blockId: focusBlockId }}
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
                <header {...stylex.props(editorRouteStyles.inspectorTitlebar)}>
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
        onClick={toggleInspector}
      >
        <PanelRight aria-hidden="true" size={17} strokeWidth={1.8} />
      </button>
    </main>
  )
}

export function NoteEditor({
  focusBlockId,
  noteId,
  topicId,
}: {
  focusBlockId?: string
  noteId: string
  topicId: string
}) {
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

  const handleRenameNote = useCallback(async (note: EditorNote, title: string) => {
    const result = await window.desktop.renameNote({ noteId: note.id, title })
    if (result.status === 'duplicate-title')
      return { error: 'A Note with this title already exists' }

    note.renameNote(result.note.title)
    setOpened((current) => {
      if (!current || current.note !== note)
        throw new Error(`Cannot rename unopened Note ${note.id}`)
      return {
        ...current,
        stored: {
          ...current.stored,
          title: result.note.title,
          updatedAt: result.note.updatedAt,
        },
      }
    })
  }, [])

  useEffect(() => {
    let active = true
    let unsubscribe: (() => void) | undefined

    void window.desktop.getNote({ noteId }).then(async (stored) => {
      if (!active)
        return
      const note = createEditorNote({
        id: stored.id,
        snapshot: stored.snapshot,
        title: stored.title,
      })
      if (!active)
        return

      const topic = note.getEntries().find(entry => entry.kind === 'topic' && entry.id === topicId)
      if (!topic)
        throw new Error(`Note ${note.id} does not contain Topic ${topicId}`)
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
  }, [handleNoteChange, noteId, topicId])

  if (loadError) {
    return (
      <main {...stylex.props(editorRouteStyles.statusPage)}>
        <p {...stylex.props(editorRouteStyles.statusMessage, editorRouteStyles.errorMessage)} role="alert">
          Failed to open Note:
          {' '}
          {loadError}
        </p>
      </main>
    )
  }
  if (!opened) {
    return (
      <main {...stylex.props(editorRouteStyles.statusPage)}>
        <p {...stylex.props(editorRouteStyles.statusMessage)} role="status">Opening Note…</p>
      </main>
    )
  }

  return (
    <OpenedTopicEditor
      focusBlockId={focusBlockId}
      onRenameNote={handleRenameNote}
      opened={opened}
      saveError={saveError}
    />
  )
}
