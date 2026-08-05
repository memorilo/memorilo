import type { DesktopRegularNote } from '@memorilo/desktop-preload'
import type {
  EditorNote,
  NoteEntrySnapshot,
} from '@memorilo/editor'
import type { Cause } from 'effect'
import type { PaletteCommand } from '../components/command-palette-context'
import type { EditorNoteSessionOpened, TopicValidationError } from './-note-editor-session'
import { Editor, EditorMode, useEditorTopicMode } from '@memorilo/editor'
import * as stylex from '@stylexjs/stylex'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Effect, Layer } from 'effect'
import { createEffectQuery } from 'effect-query'
import { useAtom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import {
  AlignLeft,
  ChevronRight,
  Copy,
  FileText,
  Folder,
  FolderOpen,
  ListTree,
  PanelRight,
  Star,
} from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useCommandPaletteCommands } from '../components/command-palette-context'
import { usePageTitlebar } from '../components/page-titlebar'
import { useDesktopConfiguration } from '../configuration-context'
import { noteQueryKeys } from '../queries/note-query-keys'
import { router } from '../router'
import { desktopEditorAdapters, useEditorNoteSession } from './-note-editor-session'
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

const effectQuery = createEffectQuery(Layer.empty)
const noteInspectorVisibleAtom = atomWithStorage(
  'memorilo.note-inspector-visible.v1',
  false,
  undefined,
  { getOnInit: true },
)

function setNoteFavoriteMutationOptions() {
  return effectQuery.mutationOptions<
    { favorite: boolean, noteId: string },
    Cause.UnknownError,
    never,
    { favorite: boolean, note: EditorNote, noteId: string }
  >({
    mutationFn: input => Effect.tryPromise(() => window.desktop.setNoteFavorite({
      favorite: input.favorite,
      noteId: input.noteId,
    })),
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

type CopyStatus = 'copied' | 'failed'

interface CopyFeedback {
  diagnostics: string
  status: CopyStatus
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
  validationError,
}: {
  collapsedEntryIds: ReadonlySet<string>
  favoritePending: boolean
  focusBlockId?: string
  onRenameNote: (note: EditorNote, title: string) => Promise<{ error?: string } | void>
  onToggleEntry: (entryId: string) => void
  onToggleFavorite: () => void
  opened: EditorNoteSessionOpened
  saveError: string | null
  validationError: TopicValidationError | null
}) {
  const { t } = useTranslation('editor')
  const [copyFeedback, setCopyFeedback] = useState<CopyFeedback | null>(null)
  const [inspectorVisible, setInspectorVisible] = useAtom(noteInspectorVisibleAtom)
  const configuration = useDesktopConfiguration()
  const editorAdapters = useMemo(
    () => desktopEditorAdapters(configuration.networkImagePasteBehavior),
    [configuration.networkImagePasteBehavior],
  )
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
  const mode = useEditorTopicMode(opened.topic)
  const toggleInspector = useCallback(() => setInspectorVisible(visible => !visible), [setInspectorVisible])
  const showDocumentMode = useCallback(() => opened.topic.setMode(EditorMode.Document), [opened.topic])
  const showOutlineMode = useCallback(() => opened.topic.setMode(EditorMode.Outline), [opened.topic])
  const modeCommands = useMemo<readonly PaletteCommand[]>(() => mode === EditorMode.Document
    ? [{
        accent: 'violet',
        action: t('switchMode'),
        description: t('switchToOutlineDescription'),
        icon: ListTree,
        id: 'editor-mode-outline',
        keywords: t('switchToOutlineKeywords') as unknown as readonly string[],
        label: t('switchToOutlineMode'),
        run: showOutlineMode,
        section: t('editorSection') as PaletteCommand['section'],
      }]
    : [{
        accent: 'blue',
        action: t('switchMode'),
        description: t('switchToDocumentDescription'),
        icon: AlignLeft,
        id: 'editor-mode-document',
        keywords: t('switchToDocumentKeywords') as unknown as readonly string[],
        label: t('switchToDocumentMode'),
        run: showDocumentMode,
        section: t('editorSection') as PaletteCommand['section'],
      }], [mode, showDocumentMode, showOutlineMode, t])
  useCommandPaletteCommands(modeCommands)
  const renameNote = useCallback((title: string) => onRenameNote(opened.note, title), [onRenameNote, opened.note])
  const copyValidationDiagnostics = useCallback(async () => {
    if (!validationError)
      return
    try {
      if (typeof navigator.clipboard?.writeText !== 'function')
        throw new Error('The Clipboard API is unavailable')
      await navigator.clipboard.writeText(validationError.diagnostics)
      setCopyFeedback({ diagnostics: validationError.diagnostics, status: 'copied' })
    }
    catch (error) {
      console.error('Failed to copy Topic validation diagnostics', error)
      setCopyFeedback({ diagnostics: validationError.diagnostics, status: 'failed' })
    }
  }, [validationError])
  const copyStatus = copyFeedback !== null && copyFeedback.diagnostics === validationError?.diagnostics
    ? copyFeedback.status
    : null
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
          aria-label={opened.stored.favorite ? t('removeFromFavorites') : t('addToFavorites')}
          aria-pressed={opened.stored.favorite}
          disabled={favoritePending}
          title={opened.stored.favorite ? t('removeFromFavorites') : t('addToFavorites')}
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
          aria-label={inspectorVisible ? t('hideNoteInspector') : t('showNoteInspector')}
          title={inspectorVisible ? t('hideNoteInspector') : t('showNoteInspector')}
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
    t,
    toggleInspector,
  ])
  usePageTitlebar(titlebar)

  return (
    <main {...stylex.props(editorRouteStyles.page)}>
      <section {...stylex.props(editorRouteStyles.workspace)} aria-label={opened.stored.title}>
        {saveError || validationError
          ? (
              <div {...stylex.props(editorRouteStyles.alertStack)}>
                {validationError
                  ? (
                      <div {...stylex.props(editorRouteStyles.validationError)}>
                        <span {...stylex.props(editorRouteStyles.validationErrorMessage)} aria-live="assertive" role="alert">
                          {validationError.message}
                        </span>
                        <div {...stylex.props(editorRouteStyles.validationErrorActions)}>
                          <button
                            {...stylex.props(editorRouteStyles.copyDiagnosticsButton)}
                            aria-label={t('copyDiagnosticsLabel')}
                            title={t('copyDiagnosticsLabel')}
                            type="button"
                            onClick={copyValidationDiagnostics}
                          >
                            <Copy aria-hidden="true" size={14} strokeWidth={1.9} />
                            <span>{t('copyDiagnostics')}</span>
                          </button>
                          <span {...stylex.props(editorRouteStyles.copyDiagnosticsStatus)} aria-live="polite" role="status">
                            {copyStatus === 'copied' ? t('copied', { ns: 'common' }) : copyStatus === 'failed' ? t('copyFailed', { ns: 'common' }) : ''}
                          </span>
                        </div>
                      </div>
                    )
                  : null}
                {saveError
                  ? (
                      <div {...stylex.props(editorRouteStyles.saveError)} aria-live="polite" role="status">
                        {t('failedToSaveNote', { message: saveError })}
                      </div>
                    )
                  : null}
              </div>
            )
          : null}
        <Editor
          adapters={editorAdapters}
          focus={focusBlockId === undefined ? undefined : { blockId: focusBlockId }}
          outline={{ outdentBehavior: configuration.outdentBehavior }}
          topic={opened.topic}
        />
      </section>
      <AnimatePresence initial={false}>
        {inspectorVisible
          ? (
              <motion.aside
                {...stylex.props(editorRouteStyles.inspector)}
                animate={{ opacity: 1, width: 292, x: 0 }}
                aria-label={t('noteInspector')}
                exit={{ opacity: 0, width: 0, x: 18 }}
                initial={{ opacity: 0, width: 0, x: 18 }}
                transition={inspectorTransition}
              >
                <header {...stylex.props(editorRouteStyles.inspectorTitlebar)}>
                  <div {...stylex.props(editorRouteStyles.inspectorTitleGroup)}>
                    <h1 {...stylex.props(editorRouteStyles.inspectorTitle)}>{t('topics')}</h1>
                    <span {...stylex.props(editorRouteStyles.inspectorCount)}>{topicCount}</span>
                  </div>
                </header>
                <div {...stylex.props(editorRouteStyles.inspectorContent)}>
                  <section {...stylex.props(editorRouteStyles.inspectorSection)} aria-labelledby="topic-structure-heading">
                    <div {...stylex.props(editorRouteStyles.inspectorSectionHeading)}>
                      <h2 id="topic-structure-heading" {...stylex.props(editorRouteStyles.inspectorSectionTitle)}>
                        {t('structure')}
                      </h2>
                      <span {...stylex.props(editorRouteStyles.inspectorSectionMeta)}>{t('due', { count: 2 })}</span>
                    </div>
                    <div {...stylex.props(editorRouteStyles.topicTree)} role="list">
                      <AnimatePresence initial={false}>
                        {visibleEntries.map(({ depth, entry, hasChildren }) => {
                          const collapsed = collapsedEntryIds.has(entry.id)
                          const label = entry.kind === 'folder' ? entry.name : entry.title || t('untitledTopic')
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
                                              aria-label={t('collapsedExpand', { action: collapsed ? t('expand') : t('collapse'), label })}
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
                        {t('learning')}
                      </h2>
                      <span {...stylex.props(editorRouteStyles.learningState)}>
                        <span {...stylex.props(editorRouteStyles.learningStateDot)} />
                        {t('reviewing')}
                      </span>
                    </div>
                    <dl {...stylex.props(editorRouteStyles.learningDetails)}>
                      <div {...stylex.props(editorRouteStyles.learningDetail)}>
                        <dt {...stylex.props(editorRouteStyles.learningTerm)}>{t('nextReview')}</dt>
                        <dd {...stylex.props(editorRouteStyles.learningValue, editorRouteStyles.learningValueDue)}>{t('today')}</dd>
                      </div>
                      <div {...stylex.props(editorRouteStyles.learningDetail)}>
                        <dt {...stylex.props(editorRouteStyles.learningTerm)}>{t('stability')}</dt>
                        <dd {...stylex.props(editorRouteStyles.learningValue)}>3.2 days</dd>
                      </div>
                      <div {...stylex.props(editorRouteStyles.learningDetail)}>
                        <dt {...stylex.props(editorRouteStyles.learningTerm)}>{t('priority')}</dt>
                        <dd {...stylex.props(editorRouteStyles.learningValue)}>{t('normal')}</dd>
                      </div>
                    </dl>
                    <div {...stylex.props(editorRouteStyles.learningProgressHeader)}>
                      <span>{t('reviewed')}</span>
                      <span>{t('topicsProgress', { count: 3, total: 6 })}</span>
                    </div>
                    <div
                      {...stylex.props(editorRouteStyles.learningProgressTrack)}
                      aria-label={t('topicsReviewed', { count: 3, total: 6 })}
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
  const { t } = useTranslation(['editor', 'pages'])
  const queryClient = useQueryClient()
  const loadNote = useCallback(async (): Promise<DesktopRegularNote> => {
    const stored = await window.desktop.getNote({ noteId })
    if (stored.kind === 'journal') {
      await router.navigate({ search: { date: stored.journalDate }, to: '/journals' })
      throw new Error(`Journal ${stored.journalDate} must open in the Journal feed`)
    }
    return stored
  }, [noteId])
  const handleOpened = useCallback(async (current: EditorNoteSessionOpened) => {
    await window.desktop.recordNoteOpened({
      noteId: current.note.id,
      topicId: current.topic.topicId,
    })
    void queryClient.invalidateQueries({ queryKey: noteQueryKeys.recent })
  }, [queryClient])
  const handleExternalUpdate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: noteQueryKeys.lists })
  }, [queryClient])
  const session = useEditorNoteSession<DesktopRegularNote>({
    loadNote,
    noteId,
    onExternalUpdate: handleExternalUpdate,
    onOpened: handleOpened,
    topicId,
  })
  const { loadError, opened, saveError, updateStored, validationError } = session
  const { isPending: favoritePending, mutate: mutateFavorite } = useMutation({
    ...setNoteFavoriteMutationOptions(),
    onSuccess: (state, input) => {
      updateStored(input.note, { favorite: state.favorite })
      void queryClient.invalidateQueries({ queryKey: noteQueryKeys.lists })
      void queryClient.invalidateQueries({ queryKey: noteQueryKeys.favorites })
    },
  })

  const handleRenameNote = useCallback(async (note: EditorNote, title: string) => {
    const result = await window.desktop.renameNote({ noteId: note.id, title })
    if (result.status === 'duplicate-title')
      return { error: t('duplicateTitle', { ns: 'pages' }) }
    if (result.status === 'journal-title-immutable')
      throw new Error(`Regular Note ${note.id} was unexpectedly classified as Journal ${result.journalDate}`)

    if (!updateStored(note, {
      title: result.note.title,
      updatedAt: result.note.updatedAt,
    })) {
      return
    }
    note.renameNote(result.note.title)
    void queryClient.invalidateQueries({ queryKey: noteQueryKeys.lists })
    void queryClient.invalidateQueries({ queryKey: noteQueryKeys.favorites })
    void queryClient.invalidateQueries({ queryKey: noteQueryKeys.recent })
  }, [queryClient, t, updateStored])

  const handleToggleFavorite = useCallback(() => {
    if (!opened)
      return
    mutateFavorite({
      favorite: !opened.stored.favorite,
      note: opened.note,
      noteId: opened.stored.id,
    })
  }, [mutateFavorite, opened])

  if (loadError) {
    return (
      <main {...stylex.props(editorRouteStyles.statusPage)}>
        <p {...stylex.props(editorRouteStyles.statusMessage, editorRouteStyles.errorMessage)} role="alert">
          {t('failedToOpenNote', { message: loadError })}
        </p>
      </main>
    )
  }
  if (!opened) {
    return (
      <main {...stylex.props(editorRouteStyles.statusPage)}>
        <p {...stylex.props(editorRouteStyles.statusMessage)} role="status">{t('openingNote')}</p>
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
      validationError={validationError}
    />
  )
}
