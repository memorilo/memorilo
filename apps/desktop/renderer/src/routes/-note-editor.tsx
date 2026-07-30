import type { DesktopNote } from '@memorilo/desktop-preload'
import type {
  EditorNote,
  EditorNoteChange,
  EditorTopicDocument,
  NoteEntrySnapshot,
} from '@memorilo/editor'
import type { Cause } from 'effect'
import { createEditorNote, demoEditorAdapters, Editor } from '@memorilo/editor'
import * as stylex from '@stylexjs/stylex'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Effect, Layer } from 'effect'
import { createEffectQuery } from 'effect-query'
import {
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  PanelRight,
  Star,
} from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { usePageTitlebar } from '../components/page-titlebar'
import { noteQueryKeys } from '../queries/note-query-keys'
import { editorRouteStyles } from './-note.stylex'

const inspectorSpring = {
  bounce: 0,
  type: 'spring',
  visualDuration: 0.28,
} as const

const entrySpring = {
  bounce: 0,
  type: 'spring',
  visualDuration: 0.2,
} as const

const saveDelay = 250
const effectQuery = createEffectQuery(Layer.empty)

function setNoteFavoriteMutationOptions() {
  return effectQuery.mutationOptions<
    { favorite: boolean, noteId: string },
    Cause.UnknownError,
    never,
    { favorite: boolean, noteId: string }
  >({
    mutationFn: input => Effect.tryPromise(() => window.desktop.setNoteFavorite(input)),
  })
}

interface VisibleNoteEntry {
  depth: number
  entry: NoteEntrySnapshot
  hasChildren: boolean
}

function visibleNoteEntries(
  entries: readonly NoteEntrySnapshot[],
  collapsedEntryIds: ReadonlySet<string>,
): readonly VisibleNoteEntry[] {
  const entriesById = new Map<string, NoteEntrySnapshot>()
  const parentsWithChildren = new Set<string>()
  const depths = new Map<string, number>()

  for (const entry of entries) {
    if (entriesById.has(entry.id))
      throw new Error(`Duplicate Note entry id: ${entry.id}`)
    entriesById.set(entry.id, entry)
    if (entry.parentId !== null)
      parentsWithChildren.add(entry.parentId)
  }

  const depthOf = (entry: NoteEntrySnapshot, visiting: Set<string>): number => {
    const cachedDepth = depths.get(entry.id)
    if (cachedDepth !== undefined)
      return cachedDepth
    if (visiting.has(entry.id))
      throw new Error(`Cycle detected at Note entry ${entry.id}`)

    visiting.add(entry.id)
    const depth = entry.parentId === null
      ? 0
      : (() => {
          const parent = entriesById.get(entry.parentId)
          if (!parent)
            throw new Error(`Note entry ${entry.id} has unknown parent ${entry.parentId}`)
          return depthOf(parent, visiting) + 1
        })()
    visiting.delete(entry.id)
    depths.set(entry.id, depth)
    return depth
  }

  for (const entry of entries)
    depthOf(entry, new Set())

  return entries.flatMap((entry) => {
    let parentId = entry.parentId
    while (parentId !== null) {
      if (collapsedEntryIds.has(parentId))
        return []
      const parent = entriesById.get(parentId)
      if (!parent)
        throw new Error(`Note entry ${entry.id} has unknown parent ${parentId}`)
      parentId = parent.parentId
    }
    const depth = depths.get(entry.id)
    if (depth === undefined)
      throw new Error(`Note entry ${entry.id} does not have a projected depth`)
    return [{ depth, entry, hasChildren: parentsWithChildren.has(entry.id) }]
  })
}

interface OpenEditorNote {
  entries: readonly NoteEntrySnapshot[]
  note: EditorNote
  stored: DesktopNote
  topic: EditorTopicDocument
}

function OpenedTopicEditor({
  collapsedEntryIds,
  favoritePending,
  focusBlockId,
  onRenameNote,
  onToggleEntry,
  onToggleFavorite,
  opened,
  saveError,
}: {
  collapsedEntryIds: ReadonlySet<string>
  favoritePending: boolean
  focusBlockId?: string
  onRenameNote: (note: EditorNote, title: string) => Promise<{ error?: string } | void>
  onToggleEntry: (entryId: string) => void
  onToggleFavorite: () => void
  opened: OpenEditorNote
  saveError: string | null
}) {
  const [inspectorVisible, setInspectorVisible] = useState(true)
  const shouldReduceMotion = useReducedMotion()
  const inspectorTransition = shouldReduceMotion ? { duration: 0 } : inspectorSpring
  const entryTransition = shouldReduceMotion ? { duration: 0 } : entrySpring
  const visibleEntries = useMemo(
    () => visibleNoteEntries(opened.entries, collapsedEntryIds),
    [collapsedEntryIds, opened.entries],
  )
  const topicCount = useMemo(
    () => opened.entries.reduce((count, entry) => count + (entry.kind === 'topic' ? 1 : 0), 0),
    [opened.entries],
  )
  const toggleInspector = useCallback(() => setInspectorVisible(visible => !visible), [])
  const renameNote = useCallback((title: string) => onRenameNote(opened.note, title), [onRenameNote, opened.note])
  const titlebar = useMemo(() => ({
    onRenameTitle: renameNote,
    title: opened.stored.title,
    trailing: (
      <>
        <button
          {...stylex.props(
            editorRouteStyles.titlebarActionButton,
            opened.stored.favorite && editorRouteStyles.titlebarFavoriteActive,
          )}
          aria-label={opened.stored.favorite ? 'Remove from Favorites' : 'Add to Favorites'}
          aria-pressed={opened.stored.favorite}
          disabled={favoritePending}
          title={opened.stored.favorite ? 'Remove from Favorites' : 'Add to Favorites'}
          type="button"
          onClick={onToggleFavorite}
        >
          <Star
            aria-hidden="true"
            fill={opened.stored.favorite ? 'currentColor' : 'none'}
            size={16}
            strokeWidth={1.8}
          />
        </button>
        <button
          {...stylex.props(editorRouteStyles.titlebarActionButton)}
          aria-label={inspectorVisible ? 'Hide Note Inspector' : 'Show Note Inspector'}
          title={inspectorVisible ? 'Hide Note Inspector' : 'Show Note Inspector'}
          type="button"
          onClick={toggleInspector}
        >
          <PanelRight aria-hidden="true" size={17} strokeWidth={1.8} />
        </button>
      </>
    ),
  }), [
    favoritePending,
    inspectorVisible,
    onToggleFavorite,
    opened.stored.favorite,
    opened.stored.title,
    renameNote,
    toggleInspector,
  ])
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
                    <span {...stylex.props(editorRouteStyles.inspectorCount)}>{topicCount}</span>
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
                    <div {...stylex.props(editorRouteStyles.topicTree)} role="list">
                      <AnimatePresence initial={false}>
                        {visibleEntries.map(({ depth, entry, hasChildren }) => {
                          const collapsed = collapsedEntryIds.has(entry.id)
                          const label = entry.kind === 'folder' ? entry.name : entry.title || 'Untitled Topic'
                          const current = entry.kind === 'topic' && entry.id === opened.topic.topicId

                          return (
                            <motion.div
                              key={entry.id}
                              {...stylex.props(
                                editorRouteStyles.entryRow(depth),
                                current && editorRouteStyles.entryRowCurrent,
                              )}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: shouldReduceMotion ? 0 : -3 }}
                              initial={{ opacity: 0, y: shouldReduceMotion ? 0 : -3 }}
                              layout={shouldReduceMotion ? false : 'position'}
                              role="listitem"
                              transition={entryTransition}
                            >
                              {entry.kind === 'folder'
                                ? (
                                    <button
                                      {...stylex.props(editorRouteStyles.folderEntryButton)}
                                      aria-expanded={hasChildren ? !collapsed : undefined}
                                      disabled={!hasChildren}
                                      title={label}
                                      type="button"
                                      onClick={() => onToggleEntry(entry.id)}
                                    >
                                      <motion.span
                                        {...stylex.props(editorRouteStyles.entryDisclosure)}
                                        animate={{ rotate: hasChildren && !collapsed ? 90 : 0 }}
                                        transition={entryTransition}
                                      >
                                        {hasChildren
                                          ? <ChevronRight aria-hidden="true" size={12} strokeWidth={1.9} />
                                          : null}
                                      </motion.span>
                                      {hasChildren && !collapsed
                                        ? <FolderOpen {...stylex.props(editorRouteStyles.folderIcon)} aria-hidden="true" size={15} strokeWidth={1.7} />
                                        : <Folder {...stylex.props(editorRouteStyles.folderIcon)} aria-hidden="true" size={15} strokeWidth={1.7} />}
                                      <span {...stylex.props(editorRouteStyles.entryLabel)}>{label}</span>
                                    </button>
                                  )
                                : (
                                    <div {...stylex.props(editorRouteStyles.topicEntry)}>
                                      {hasChildren
                                        ? (
                                            <button
                                              {...stylex.props(editorRouteStyles.entryDisclosureButton)}
                                              aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${label}`}
                                              aria-expanded={!collapsed}
                                              type="button"
                                              onClick={() => onToggleEntry(entry.id)}
                                            >
                                              <motion.span
                                                {...stylex.props(editorRouteStyles.entryDisclosure)}
                                                animate={{ rotate: collapsed ? 0 : 90 }}
                                                transition={entryTransition}
                                              >
                                                <ChevronRight aria-hidden="true" size={12} strokeWidth={1.9} />
                                              </motion.span>
                                            </button>
                                          )
                                        : <span {...stylex.props(editorRouteStyles.entryDisclosurePlaceholder)} />}
                                      <FileText
                                        {...stylex.props(
                                          editorRouteStyles.topicIcon,
                                          current && editorRouteStyles.topicIconCurrent,
                                        )}
                                        aria-hidden="true"
                                        size={14}
                                        strokeWidth={1.7}
                                      />
                                      <Link
                                        {...stylex.props(
                                          editorRouteStyles.topicLink,
                                          current && editorRouteStyles.topicLinkCurrent,
                                        )}
                                        aria-current={current ? 'page' : undefined}
                                        params={{ noteId: opened.note.id, topicId: entry.id }}
                                        preload="intent"
                                        search={{}}
                                        title={label}
                                        to="/note/$noteId/$topicId"
                                      >
                                        <span {...stylex.props(editorRouteStyles.entryLabel)}>{label}</span>
                                      </Link>
                                    </div>
                                  )}
                            </motion.div>
                          )
                        })}
                      </AnimatePresence>
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
    </main>
  )
}

export function NoteEditor({
  collapsedEntryIds,
  focusBlockId,
  noteId,
  onToggleEntry,
  topicId,
}: {
  collapsedEntryIds: ReadonlySet<string>
  focusBlockId?: string
  noteId: string
  onToggleEntry: (entryId: string) => void
  topicId: string
}) {
  const [opened, setOpened] = useState<OpenEditorNote | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const noteRef = useRef<EditorNote | null>(null)
  const pendingChangesRef = useRef<EditorNoteChange[]>([])
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const persistingRef = useRef(false)
  const flushPendingRef = useRef<(reportError: boolean) => void>(() => undefined)
  const { isPending: favoritePending, mutate: mutateFavorite } = useMutation({
    ...setNoteFavoriteMutationOptions(),
    onSuccess: (state) => {
      setOpened(current => current && current.stored.id === state.noteId
        ? { ...current, stored: { ...current.stored, favorite: state.favorite } }
        : current)
      void queryClient.invalidateQueries({ queryKey: noteQueryKeys.lists })
      void queryClient.invalidateQueries({ queryKey: noteQueryKeys.favorites })
    },
  })

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
              entries: note.getEntries(),
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
    void queryClient.invalidateQueries({ queryKey: noteQueryKeys.lists })
    void queryClient.invalidateQueries({ queryKey: noteQueryKeys.favorites })
    void queryClient.invalidateQueries({ queryKey: noteQueryKeys.recent })
  }, [queryClient])

  const handleToggleFavorite = useCallback(() => {
    if (!opened)
      return
    mutateFavorite({ favorite: !opened.stored.favorite, noteId: opened.stored.id })
  }, [mutateFavorite, opened])

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

      const entries = note.getEntries()
      const topic = entries.find(entry => entry.kind === 'topic' && entry.id === topicId)
      if (!topic)
        throw new Error(`Note ${note.id} does not contain Topic ${topicId}`)
      await window.desktop.recordNoteOpened({ noteId: note.id, topicId: topic.id })
      if (!active)
        return
      void queryClient.invalidateQueries({ queryKey: noteQueryKeys.recent })
      noteRef.current = note
      unsubscribe = note.subscribe(handleNoteChange)
      setOpened({
        entries,
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
  }, [handleNoteChange, noteId, queryClient, topicId])

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
      collapsedEntryIds={collapsedEntryIds}
      favoritePending={favoritePending}
      focusBlockId={focusBlockId}
      onRenameNote={handleRenameNote}
      onToggleEntry={onToggleEntry}
      onToggleFavorite={handleToggleFavorite}
      opened={opened}
      saveError={saveError}
    />
  )
}
