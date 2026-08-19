'use dom'

import type { SupportedLanguage } from '@memorilo/config'
import type { EditorNote, NoteEntrySnapshot } from '@memorilo/editor'
import type { DOMProps } from 'expo/dom'
import type { ReactNode } from 'react'
import type {
  CheckpointEditorSurfaceInput,
  EditorSurfaceCommand,
  EditorSurfaceCommandResult,
  EditorSurfaceSession,
  EditorSurfaceStructure,
  OpenJournalSurfaceInput,
  SavedEditorImage,
  SaveEditorImageInput,
  SaveEditorSurfaceInput,
  SaveEditorSurfaceReceipt,
} from './editor-surface-contract'
import { projectEditorNoteStorage } from '@memorilo/application/note-storage'
import {
  createEditorNote,
  Editor,
  EditorMode,
  hasTopicUserContent,
  ImageOcclusionEditor,
  JournalEditor,
  resolveJournalTopic,
  SpreadsheetEditor,
  WhiteboardEditor,
} from '@memorilo/editor'
import * as stylex from '@stylexjs/stylex'
import i18next from 'i18next'
import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { I18nextProvider } from 'react-i18next'
import { ensureDomRuntimePolyfills } from './dom-runtime-polyfills'
import { editorDomSurfaceStyles as styles } from './editor-dom-surface.stylex'
import { decodeBinary, encodeBinary } from './editor-surface-contract'
import { initEditorSurfaceI18n } from './editor-surface-i18n'
import { MobileAssetSourceRewriter } from './mobile-asset-source-rewriter'
import { loadMobileDomFonts } from './mobile-dom-fonts'
import { createMobileEditorAdapters } from './mobile-editor-adapters'
import { mobileWhiteboardLibraryPersistenceAdapter } from './whiteboard-library-storage'

ensureDomRuntimePolyfills()

interface EditorDomSurfaceBaseProps {
  checkpointNote: (input: CheckpointEditorSurfaceInput) => Promise<void>
  command: EditorSurfaceCommand | null
  dom?: DOMProps
  immersive?: boolean
  language: SupportedLanguage
  onCommandResult: (result: EditorSurfaceCommandResult) => void
  onSurfaceError: (message: string) => void
  onSurfaceReady: (structure: EditorSurfaceStructure | null) => void
  onTopicOpened: (input: { noteId: string, topicId: string }) => Promise<void>
  resolveAsset: (source: string) => Promise<string>
  saveImage: (input: SaveEditorImageInput) => Promise<SavedEditorImage>
  saveNote: (input: SaveEditorSurfaceInput) => Promise<SaveEditorSurfaceReceipt>
}

interface NoteEditorDomSurfaceProps extends EditorDomSurfaceBaseProps {
  kind: 'note'
  session: EditorSurfaceSession
}

interface JournalEditorDomSurfaceProps extends EditorDomSurfaceBaseProps {
  journalDate: string
  kind: 'journal'
  openJournal: (input: OpenJournalSurfaceInput) => Promise<EditorSurfaceSession>
}

export type EditorDomSurfaceProps = JournalEditorDomSurfaceProps | NoteEditorDomSurfaceProps

const checkpointInterval = 32
const saveDelayMilliseconds = 350
const immediateFlushBytes = 2 * 1024 * 1024
const surfaceReadyTimeoutMilliseconds = 15_000

function openEditorNote(session: EditorSurfaceSession): EditorNote {
  return createEditorNote({
    id: session.id,
    snapshot: session.snapshot === null ? null : decodeBinary(session.snapshot),
    title: session.title,
    updates: session.updates.map(decodeBinary),
  })
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

class EditorSurfaceErrorBoundary extends Component<{
  children: ReactNode
  onError: (message: string) => void
}, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    this.props.onError(error.message)
  }

  render() {
    if (this.state.error) {
      return (
        <div {...stylex.props(styles.emptyTopic)} role="alert">
          {this.state.error.message}
        </div>
      )
    }
    return this.props.children
  }
}

function journalHasContent(note: EditorNote): boolean {
  const topic = resolveJournalTopic(note, { expectedNoteTitle: note.getTitle() })
  const validation = note.getTopicValidationInput(topic.topicId)
  if (!('document' in validation))
    throw new Error(`Journal Topic ${topic.topicId} does not contain an editor document`)
  return hasTopicUserContent(validation.document)
}

function useNoteVersion(note: EditorNote): number {
  const store = useMemo(() => {
    let version = 0
    return {
      getSnapshot: () => version,
      subscribe: (listener: () => void) => note.subscribe(() => {
        version += 1
        listener()
      }),
    }
  }, [note])
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}

function TopicEditor({ adapters, note, onSelectTopic, onTopicOpened, selectedTopicId }: {
  note: EditorNote
  onSelectTopic: (topicId: string) => void
  onTopicOpened: (input: { noteId: string, topicId: string }) => Promise<void>
  selectedTopicId: string
  adapters: ReturnType<typeof createMobileEditorAdapters>
}) {
  useNoteVersion(note)
  const entries = note.getEntries()
  const topics = useMemo(
    () => entries.filter((entry): entry is Extract<NoteEntrySnapshot, { kind: 'topic' }> => entry.kind === 'topic'),
    [entries],
  )
  const selectedEntry = topics.find(entry => entry.id === selectedTopicId) ?? topics[0]

  useEffect(() => {
    if (!selectedEntry)
      return
    if (selectedEntry.id !== selectedTopicId)
      onSelectTopic(selectedEntry.id)
    void onTopicOpened({ noteId: note.id, topicId: selectedEntry.id }).catch(() => undefined)
  }, [note.id, onSelectTopic, onTopicOpened, selectedEntry, selectedTopicId])

  const reconcileCards = useCallback((document: Parameters<NonNullable<React.ComponentProps<typeof Editor>['onDocumentChange']>>[0]) => {
    if (!selectedEntry)
      return
    note.reconcileCardTopics({ document, topicId: selectedEntry.id })
  }, [note, selectedEntry])

  if (!selectedEntry) {
    return (
      <div data-mobile-editor-surface-ready="" {...stylex.props(styles.emptyTopic)}>
        This Note does not contain an editable Topic.
      </div>
    )
  }

  const editable = selectedEntry.topicType === 'regular' || selectedEntry.topicType === 'book'
  const editorTopic = editable ? note.getTopic(selectedEntry.id) : null
  return (
    <div
      data-mobile-editor-surface-ready={editorTopic === null ? '' : undefined}
      {...stylex.props(styles.workspace)}
    >
      {editorTopic !== null
        ? (
            <>
              <Editor
                adapters={adapters}
                cardPreviewDisabled={selectedEntry.topicType === 'regular'}
                cardTopic={selectedEntry.topicType === 'regular' && selectedEntry.cardSource !== undefined}
                layout="standalone"
                learningEnabled={note.getLearningEnabled()}
                onDocumentChange={reconcileCards}
                topic={editorTopic}
              />
            </>
          )
        : selectedEntry.topicType === 'spreadsheet'
          ? (
              <SpreadsheetEditor
                title={selectedEntry.title}
                topic={note.getSpreadsheetTopic(selectedEntry.id)}
              />
            )
          : selectedEntry.topicType === 'whiteboard'
            ? (
                <WhiteboardEditor
                  adapters={adapters}
                  inspectorVisible={false}
                  learningEnabled={note.getLearningEnabled()}
                  libraryPersistenceAdapter={mobileWhiteboardLibraryPersistenceAdapter}
                  topic={note.getWhiteboardTopic(selectedEntry.id)}
                />
              )
            : selectedEntry.topicType === 'image-occlusion'
              ? (
                  <ImageOcclusionEditor
                    title={selectedEntry.title}
                    topic={note.getImageOcclusionTopic(selectedEntry.id)}
                    onRename={title => note.renameEntry(selectedEntry.id, title)}
                  />
                )
              : (
                  <div {...stylex.props(styles.emptyTopic)}>
                    This Topic type is unavailable.
                  </div>
                )}
    </div>
  )
}

function PersistentEditorSurface({
  checkpointNote,
  command,
  immersive,
  kind,
  onCommandResult,
  onSurfaceError,
  onSurfaceReady,
  onTopicOpened,
  resolveAsset,
  saveImage,
  saveNote,
  session,
}: EditorDomSurfaceBaseProps & {
  kind: 'journal' | 'note'
  session: EditorSurfaceSession
}) {
  const [persistenceError, setPersistenceError] = useState<Error | null>(null)
  const note = useMemo(() => openEditorNote(session), [session])
  const journalTopic = useMemo(() => kind === 'journal' ? resolveJournalTopic(note) : null, [kind, note])
  const [selectedTopicId, setSelectedTopicId] = useState(
    () => note.getEntries().find(entry => entry.kind === 'topic')?.id ?? '',
  )
  const adapters = useMemo(() => createMobileEditorAdapters(saveImage), [saveImage])
  const surfaceRootRef = useRef<HTMLDivElement>(null)
  const callbacks = useRef({ checkpointNote, onCommandResult, onSurfaceError, onSurfaceReady, onTopicOpened, saveNote })
  const flushRef = useRef<() => Promise<void>>(async () => undefined)
  const handledCommandRef = useRef(0)
  const selectedTopicIdRef = useRef(selectedTopicId)
  selectedTopicIdRef.current = selectedTopicId
  callbacks.current = { checkpointNote, onCommandResult, onSurfaceError, onSurfaceReady, onTopicOpened, saveNote }

  const structure = useCallback((nextSelectedTopicId = selectedTopicIdRef.current): EditorSurfaceStructure => ({
    entries: note.getEntries(),
    selectedTopicId: nextSelectedTopicId || null,
  }), [note])

  useEffect(() => {
    let active = true
    let checkpointSequence = session.checkpointSequence
    let hasCheckpoint = session.snapshot !== null
    let flushTimer: number | null = null
    let pending: string[] = []
    let pendingBytes = 0
    let drainPromise: Promise<void> | null = null

    const checkpoint = async (latestSequence: number): Promise<void> => {
      if (latestSequence - checkpointSequence < checkpointInterval && hasCheckpoint)
        return
      await callbacks.current.checkpointNote({
        noteId: note.id,
        snapshot: encodeBinary(note.exportSnapshot()),
        throughSequence: latestSequence,
      })
      checkpointSequence = latestSequence
      hasCheckpoint = true
    }

    const flush = (): Promise<void> => {
      if (drainPromise)
        return drainPromise
      if (flushTimer !== null) {
        window.clearTimeout(flushTimer)
        flushTimer = null
      }
      drainPromise = (async () => {
        while (pending.length > 0) {
          const updates = pending
          const bytes = pendingBytes
          pending = []
          pendingBytes = 0
          try {
            const projection = projectEditorNoteStorage(note)
            const receipt = await callbacks.current.saveNote({
              ...projection,
              ...(kind === 'journal' ? { journalHasUserContent: journalHasContent(note) } : {}),
              noteId: note.id,
              title: note.getTitle(),
              updates,
            })
            await checkpoint(receipt.latestSequence)
            if (active)
              setPersistenceError(null)
          }
          catch (error) {
            pending = [...updates, ...pending]
            pendingBytes += bytes
            const failure = toError(error)
            if (active)
              setPersistenceError(failure)
            throw failure
          }
        }
      })().finally(() => {
        drainPromise = null
      })
      return drainPromise
    }
    flushRef.current = flush

    const schedule = (): void => {
      if (pendingBytes >= immediateFlushBytes) {
        void flush().catch(() => undefined)
        return
      }
      if (flushTimer !== null)
        window.clearTimeout(flushTimer)
      flushTimer = window.setTimeout(() => void flush().catch(() => undefined), saveDelayMilliseconds)
    }

    const unsubscribe = note.subscribe((change) => {
      const update = encodeBinary(change.update)
      pending.push(update)
      pendingBytes += update.length
      schedule()
    })

    if (session.snapshot === null) {
      if (session.updates.length === 0) {
        const update = encodeBinary(note.exportUpdates())
        pending.push(update)
        pendingBytes += update.length
        void flush().catch(() => undefined)
      }
      else {
        void checkpoint(session.latestSequence).catch((error: unknown) => {
          if (active)
            setPersistenceError(toError(error))
        })
      }
    }

    return () => {
      active = false
      unsubscribe()
      if (flushTimer !== null)
        window.clearTimeout(flushTimer)
      void flush().catch(() => undefined)
    }
  }, [kind, note, session])

  useEffect(() => {
    if (!command || command.id <= handledCommandRef.current)
      return
    handledCommandRef.current = command.id
    void (async () => {
      try {
        let nextSelectedTopicId = selectedTopicIdRef.current
        if (command.type === 'rename-note') {
          if (kind === 'journal')
            throw new Error('Journal titles are fixed to their local date')
          note.renameNote(command.title)
        }
        else if (command.type !== 'flush') {
          if (kind === 'journal')
            throw new Error('Journal structure is fixed')
          if (command.type === 'refresh-structure') {
            // The current snapshot is returned below after pending changes flush.
          }
          else if (command.type === 'open-topic') {
            const entry = note.getEntries().find(candidate => candidate.id === command.topicId)
            if (!entry || entry.kind !== 'topic')
              throw new Error(`Note does not contain Topic ${command.topicId}`)
            nextSelectedTopicId = command.topicId
          }
          else if (command.type === 'create-entry') {
            const input = { parentId: command.parentId, title: command.label }
            const createdId = command.entryType === 'folder'
              ? note.createFolder({ name: command.label, parentId: command.parentId })
              : command.entryType === 'spreadsheet'
                ? note.createSpreadsheetTopic(input)
                : command.entryType === 'whiteboard'
                  ? note.createWhiteboardTopic(input)
                  : note.createTopic({ ...input, mode: EditorMode.Document })
            if (command.entryType !== 'folder')
              nextSelectedTopicId = createdId
          }
          else if (command.type === 'rename-entry') {
            note.renameEntry(command.entryId, command.label)
          }
          else if (command.type === 'move-entry') {
            note.moveEntry({
              entryId: command.entryId,
              ...(command.index === undefined ? {} : { index: command.index }),
              parentId: command.parentId,
            })
          }
          else if (command.type === 'delete-entry') {
            note.deleteEntry({ entryId: command.entryId, strategy: command.strategy })
            const entries = note.getEntries()
            if (!entries.some(entry => entry.kind === 'topic' && entry.id === nextSelectedTopicId))
              nextSelectedTopicId = entries.find(entry => entry.kind === 'topic')?.id ?? ''
          }
        }
        if (nextSelectedTopicId !== selectedTopicIdRef.current) {
          selectedTopicIdRef.current = nextSelectedTopicId
          setSelectedTopicId(nextSelectedTopicId)
        }
        await flushRef.current()
        callbacks.current.onCommandResult({
          commandId: command.id,
          ...(command.type === 'flush' || command.type === 'rename-note'
            ? {}
            : { structure: structure(nextSelectedTopicId) }),
          ...(command.type === 'rename-note' ? { title: command.title } : {}),
        })
      }
      catch (error) {
        callbacks.current.onCommandResult({
          commandId: command.id,
          error: toError(error).message,
        })
      }
    })()
  }, [command, kind, note, structure])

  useEffect(() => {
    const root = surfaceRootRef.current
    if (!root) {
      callbacks.current.onSurfaceError('Editor surface did not mount')
      return
    }

    let finished = false
    let animationFrame = 0
    let timeout = 0
    let observer: MutationObserver | null = null

    const cleanup = () => {
      observer?.disconnect()
      window.cancelAnimationFrame(animationFrame)
      window.clearTimeout(timeout)
    }
    const finish = () => {
      if (finished)
        return
      finished = true
      cleanup()
      callbacks.current.onSurfaceReady(kind === 'note' ? structure() : null)
    }
    const checkReady = () => {
      // The shared Editor mounts its content node before ProseMirror finishes
      // attaching the final class and contenteditable attribute. Release the
      // native loading veil at that stable boundary so it cannot hide a valid
      // editor while the final DOM attributes settle.
      const editorContent = root.querySelector('[data-editor-content]')
      const editableContent = root.querySelector('[data-editor-content].ProseMirror[contenteditable="true"]')
      const nonRichTextSurface = root.querySelector('[data-mobile-editor-surface-ready]')
      if (editorContent instanceof HTMLElement || editableContent instanceof HTMLElement) {
        if (editableContent instanceof HTMLElement)
          editableContent.blur()
        finish()
      }
      else if (nonRichTextSurface) {
        finish()
      }
    }

    observer = new MutationObserver(checkReady)
    observer.observe(root, {
      attributeFilter: ['class', 'contenteditable'],
      attributes: true,
      childList: true,
      subtree: true,
    })
    timeout = window.setTimeout(() => {
      if (finished)
        return
      finished = true
      cleanup()
      callbacks.current.onSurfaceError('Editor did not finish loading')
    }, surfaceReadyTimeoutMilliseconds)
    animationFrame = window.requestAnimationFrame(checkReady)

    return cleanup
  }, [kind, note, structure])

  return (
    <div
      ref={surfaceRootRef}
      {...stylex.props(styles.root, immersive && styles.rootImmersive)}
      data-mobile-editor-root=""
    >
      <MobileAssetSourceRewriter resolveAsset={resolveAsset} />
      {persistenceError
        ? <div {...stylex.props(styles.alert)} role="alert">{persistenceError.message}</div>
        : null}
      {journalTopic !== null
        ? (
            <div {...stylex.props(styles.workspace)}>
              <JournalEditor
                adapters={adapters}
                learningEnabled={note.getLearningEnabled()}
                note={note}
              />
            </div>
          )
        : (
            <TopicEditor
              adapters={adapters}
              note={note}
              selectedTopicId={selectedTopicId}
              onSelectTopic={setSelectedTopicId}
              onTopicOpened={callbacks.current.onTopicOpened}
            />
          )}
    </div>
  )
}

function JournalSurface({
  journalDate,
  onSurfaceError,
  openJournal,
  ...props
}: Omit<JournalEditorDomSurfaceProps, 'dom' | 'kind'>) {
  const [session, setSession] = useState<EditorSurfaceSession | null>(null)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let active = true
    const template = createEditorNote({
      id: crypto.randomUUID(),
      learningEnabled: true,
      title: journalDate,
    })
    const projection = projectEditorNoteStorage(template)
    void openJournal({
      ...projection,
      id: template.id,
      journalDate,
      snapshot: encodeBinary(template.exportSnapshot()),
    }).then(
      (opened) => {
        if (active)
          setSession(opened)
      },
      (failure: unknown) => {
        if (active) {
          const nextError = toError(failure)
          setError(nextError)
          onSurfaceError(nextError.message)
        }
      },
    )
    return () => {
      active = false
    }
  }, [journalDate, onSurfaceError, openJournal])

  if (error)
    return <div {...stylex.props(styles.emptyTopic)} role="alert">{error.message}</div>
  if (!session)
    return <div {...stylex.props(styles.emptyTopic)} aria-busy="true">{i18next.t('loadingJournal', { ns: 'editor' })}</div>
  return <PersistentEditorSurface {...props} kind="journal" onSurfaceError={onSurfaceError} session={session} />
}

export default function EditorDomSurface(props: EditorDomSurfaceProps) {
  const [i18nReady, setI18nReady] = useState(false)
  const [startupError, setStartupError] = useState<Error | null>(null)
  const onSurfaceError = props.onSurfaceError

  useEffect(() => {
    let active = true
    void loadMobileDomFonts().catch(() => undefined)
    void initEditorSurfaceI18n(i18next, props.language).then(
      () => {
        if (active)
          setI18nReady(true)
      },
      (failure: unknown) => {
        if (active) {
          const nextError = toError(failure)
          setStartupError(nextError)
          onSurfaceError(nextError.message)
        }
      },
    )
    return () => {
      active = false
    }
  }, [onSurfaceError, props.language])

  if (startupError)
    return <div {...stylex.props(styles.emptyTopic)} role="alert">{startupError.message}</div>
  if (!i18nReady)
    return <div aria-busy="true" />

  return (
    <I18nextProvider i18n={i18next}>
      <EditorSurfaceErrorBoundary onError={props.onSurfaceError}>
        {props.kind === 'journal'
          ? (
              <JournalSurface
                checkpointNote={props.checkpointNote}
                command={props.command}
                journalDate={props.journalDate}
                language={props.language}
                onCommandResult={props.onCommandResult}
                onSurfaceError={props.onSurfaceError}
                onSurfaceReady={props.onSurfaceReady}
                onTopicOpened={props.onTopicOpened}
                openJournal={props.openJournal}
                resolveAsset={props.resolveAsset}
                saveImage={props.saveImage}
                saveNote={props.saveNote}
              />
            )
          : (
              <PersistentEditorSurface
                checkpointNote={props.checkpointNote}
                command={props.command}
                kind="note"
                immersive={props.immersive}
                language={props.language}
                onCommandResult={props.onCommandResult}
                onSurfaceError={props.onSurfaceError}
                onSurfaceReady={props.onSurfaceReady}
                onTopicOpened={props.onTopicOpened}
                resolveAsset={props.resolveAsset}
                saveImage={props.saveImage}
                saveNote={props.saveNote}
                session={props.session}
              />
            )}
      </EditorSurfaceErrorBoundary>
    </I18nextProvider>
  )
}
