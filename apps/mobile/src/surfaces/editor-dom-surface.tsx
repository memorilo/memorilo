'use dom'

import type { EditorNote, NoteEntrySnapshot } from '@memorilo/editor'
import type { DOMProps } from 'expo/dom'
import type {
  CheckpointEditorSurfaceInput,
  EditorSurfaceCommand,
  EditorSurfaceCommandResult,
  EditorSurfaceSession,
  OpenJournalSurfaceInput,
  SaveEditorSurfaceInput,
  SaveEditorSurfaceReceipt,
} from './editor-surface-contract'
import { projectEditorNoteStorage } from '@memorilo/application/note-storage'
import {
  createEditorNote,
  demoEditorAdapters,
  Editor,
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
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { I18nextProvider } from 'react-i18next'
import { editorDomSurfaceStyles as styles } from './editor-dom-surface.stylex'
import { decodeBinary, encodeBinary } from './editor-surface-contract'
import { initEditorSurfaceI18n } from './editor-surface-i18n'
import { loadMobileDomFonts } from './mobile-dom-fonts'
import { mobileWhiteboardLibraryPersistenceAdapter } from './whiteboard-library-storage'

interface EditorDomSurfaceBaseProps {
  checkpointNote: (input: CheckpointEditorSurfaceInput) => Promise<void>
  command: EditorSurfaceCommand | null
  dom?: DOMProps
  onCommandResult: (result: EditorSurfaceCommandResult) => void
  onTopicOpened: (input: { noteId: string, topicId: string }) => Promise<void>
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

function TopicEditor({ note, onTopicOpened }: {
  note: EditorNote
  onTopicOpened: (input: { noteId: string, topicId: string }) => Promise<void>
}) {
  useNoteVersion(note)
  const entries = note.getEntries()
  const topics = useMemo(
    () => entries.filter((entry): entry is Extract<NoteEntrySnapshot, { kind: 'topic' }> => entry.kind === 'topic'),
    [entries],
  )
  const [selectedTopicId, setSelectedTopicId] = useState(() => topics[0]?.id ?? '')
  const selectedEntry = topics.find(entry => entry.id === selectedTopicId) ?? topics[0]

  useEffect(() => {
    if (!selectedEntry)
      return
    void onTopicOpened({ noteId: note.id, topicId: selectedEntry.id }).catch(() => undefined)
  }, [note.id, onTopicOpened, selectedEntry])

  const reconcileCards = useCallback((document: Parameters<NonNullable<React.ComponentProps<typeof Editor>['onDocumentChange']>>[0]) => {
    if (!selectedEntry)
      return
    note.reconcileCardTopics({ document, topicId: selectedEntry.id })
  }, [note, selectedEntry])

  if (!selectedEntry)
    return <div {...stylex.props(styles.emptyTopic)}>This Note does not contain an editable Topic.</div>

  const editable = selectedEntry.topicType === 'regular' || selectedEntry.topicType === 'book'
  return (
    <>
      {topics.length > 1
        ? (
            <nav {...stylex.props(styles.topicNavigation)} aria-label="Note Topics">
              {topics.map(entry => (
                <button
                  key={entry.id}
                  {...stylex.props(
                    styles.topicButton,
                    entry.id === selectedEntry.id && styles.topicButtonSelected,
                  )}
                  aria-current={entry.id === selectedEntry.id ? 'page' : undefined}
                  type="button"
                  onClick={() => setSelectedTopicId(entry.id)}
                >
                  {entry.title || 'Untitled Topic'}
                </button>
              ))}
            </nav>
          )
        : null}
      <div {...stylex.props(styles.workspace)}>
        {editable
          ? (
              <Editor
                adapters={demoEditorAdapters}
                cardPreviewDisabled={selectedEntry.topicType === 'regular'}
                cardTopic={selectedEntry.topicType === 'regular' && selectedEntry.cardSource !== undefined}
                layout="standalone"
                learningEnabled={note.getLearningEnabled()}
                onDocumentChange={reconcileCards}
                topic={note.getTopic(selectedEntry.id)}
              />
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
                    adapters={demoEditorAdapters}
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
    </>
  )
}

function PersistentEditorSurface({
  checkpointNote,
  command,
  kind,
  onCommandResult,
  onTopicOpened,
  saveNote,
  session,
}: EditorDomSurfaceBaseProps & {
  kind: 'journal' | 'note'
  session: EditorSurfaceSession
}) {
  const [persistenceError, setPersistenceError] = useState<Error | null>(null)
  const note = useMemo(() => openEditorNote(session), [session])
  const callbacks = useRef({ checkpointNote, onCommandResult, onTopicOpened, saveNote })
  const flushRef = useRef<() => Promise<void>>(async () => undefined)
  const handledCommandRef = useRef(0)
  callbacks.current = { checkpointNote, onCommandResult, onTopicOpened, saveNote }

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
        if (command.type === 'rename-note') {
          if (kind === 'journal')
            throw new Error('Journal titles are fixed to their local date')
          note.renameNote(command.title)
        }
        await flushRef.current()
        callbacks.current.onCommandResult({
          commandId: command.id,
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
  }, [command, kind, note])

  return (
    <div {...stylex.props(styles.root)}>
      {persistenceError
        ? <div {...stylex.props(styles.alert)} role="alert">{persistenceError.message}</div>
        : null}
      {kind === 'journal'
        ? (
            <div {...stylex.props(styles.workspace)}>
              <JournalEditor
                adapters={demoEditorAdapters}
                learningEnabled={note.getLearningEnabled()}
                note={note}
              />
            </div>
          )
        : <TopicEditor note={note} onTopicOpened={callbacks.current.onTopicOpened} />}
    </div>
  )
}

function JournalSurface({
  journalDate,
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
        if (active)
          setError(toError(failure))
      },
    )
    return () => {
      active = false
    }
  }, [journalDate, openJournal])

  if (error)
    return <div {...stylex.props(styles.emptyTopic)} role="alert">{error.message}</div>
  if (!session)
    return <div {...stylex.props(styles.emptyTopic)} aria-busy="true">Opening Journal...</div>
  return <PersistentEditorSurface {...props} kind="journal" session={session} />
}

export default function EditorDomSurface(props: EditorDomSurfaceProps) {
  const [i18nReady, setI18nReady] = useState(false)
  const [startupError, setStartupError] = useState<Error | null>(null)

  useEffect(() => {
    let active = true
    void Promise.all([
      initEditorSurfaceI18n(i18next),
      loadMobileDomFonts(),
    ]).then(
      () => {
        if (active)
          setI18nReady(true)
      },
      (failure: unknown) => {
        if (active)
          setStartupError(toError(failure))
      },
    )
    return () => {
      active = false
    }
  }, [])

  if (startupError)
    return <div {...stylex.props(styles.emptyTopic)} role="alert">{startupError.message}</div>
  if (!i18nReady)
    return <div aria-busy="true" />

  return (
    <I18nextProvider i18n={i18next}>
      {props.kind === 'journal'
        ? (
            <JournalSurface
              checkpointNote={props.checkpointNote}
              command={props.command}
              journalDate={props.journalDate}
              onCommandResult={props.onCommandResult}
              onTopicOpened={props.onTopicOpened}
              openJournal={props.openJournal}
              saveNote={props.saveNote}
            />
          )
        : (
            <PersistentEditorSurface
              checkpointNote={props.checkpointNote}
              command={props.command}
              kind="note"
              onCommandResult={props.onCommandResult}
              onTopicOpened={props.onTopicOpened}
              saveNote={props.saveNote}
              session={props.session}
            />
          )}
    </I18nextProvider>
  )
}
