import type { StoredNote } from '@memorilo/editor-storage'
import type { DOMProps } from 'expo/dom'
import type { Ref } from 'react'
import type {
  CheckpointEditorSurfaceInput,
  EditorSurfaceCommand,
  EditorSurfaceCommandInput,
  EditorSurfaceCommandResult,
  EditorSurfaceEntryType,
  EditorSurfaceSession,
  EditorSurfaceStructure,
  OpenJournalSurfaceInput,
  SaveEditorImageInput,
  SaveEditorSurfaceInput,
  SaveEditorSurfaceReceipt,
} from './editor-surface-contract'
import type { MobileRuntime } from '@/application/mobile-runtime'
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, AppState, StyleSheet, Text, View } from 'react-native'
import { useMobileLanguage } from '@/application/mobile-language-hook'
import { colors } from '@/ui/theme'
import EditorDomSurface from './editor-dom-surface'
import { decodeBinary, encodeBinary } from './editor-surface-contract'

interface EditorDomHostBaseProps {
  immersive?: boolean
  onReady?: () => void
  onSaved?: () => void
  onStructureChanged?: (structure: EditorSurfaceStructure) => void
  onTitleChanged?: (title: string) => void
  ref?: Ref<EditorDomHostHandle>
  runtime: MobileRuntime
}

interface NoteEditorDomHostProps extends EditorDomHostBaseProps {
  kind: 'note'
  noteId: string
}

interface JournalEditorDomHostProps extends EditorDomHostBaseProps {
  journalDate: string
  kind: 'journal'
}

export type EditorDomHostProps = JournalEditorDomHostProps | NoteEditorDomHostProps

export interface EditorDomHostHandle {
  createEntry: (input: {
    entryType: EditorSurfaceEntryType
    label: string
    parentId: string | null
  }) => Promise<EditorSurfaceStructure>
  deleteEntry: (input: Omit<Extract<EditorSurfaceCommandInput, { type: 'delete-entry' }>, 'type'>) => Promise<EditorSurfaceStructure>
  flush: () => Promise<void>
  moveEntry: (input: Omit<Extract<EditorSurfaceCommandInput, { type: 'move-entry' }>, 'type'>) => Promise<EditorSurfaceStructure>
  openTopic: (topicId: string) => Promise<EditorSurfaceStructure>
  refreshStructure: () => Promise<EditorSurfaceStructure>
  renameEntry: (entryId: string, label: string) => Promise<EditorSurfaceStructure>
  renameNote: (title: string) => Promise<void>
}

interface PendingCommand {
  id: number
  reject: (error: Error) => void
  resolve: (result: EditorSurfaceCommandResult) => void
}

function toSurfaceSession(note: StoredNote): EditorSurfaceSession {
  return {
    checkpointSequence: note.checkpointSequence,
    id: note.id,
    latestSequence: note.latestSequence,
    snapshot: note.snapshot === null ? null : encodeBinary(note.snapshot),
    title: note.title,
    updates: note.updates.map(update => encodeBinary(update.update)),
  }
}

const dom: DOMProps = {
  containerStyle: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  style: { flex: 1 },
}

const immersiveDom: DOMProps = {
  containerStyle: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 72,
  },
  style: { flex: 1 },
}

const styles = StyleSheet.create({
  centered: {
    alignItems: 'center',
    flex: 1,
    gap: 12,
    justifyContent: 'center',
    padding: 24,
  },
  error: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  root: {
    flex: 1,
    height: '100%',
    minHeight: 0,
  },
  surfaceLoading: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    justifyContent: 'center',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
})

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

export function EditorDomHost(props: EditorDomHostProps) {
  const { t } = useTranslation('editor')
  const { immersive = false, onReady, onSaved, onStructureChanged, onTitleChanged, runtime } = props
  const { language } = useMobileLanguage()
  const noteId = props.kind === 'note' ? props.noteId : null
  const [session, setSession] = useState<EditorSurfaceSession | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [command, setCommand] = useState<EditorSurfaceCommand | null>(null)
  const [surfaceReady, setSurfaceReady] = useState(false)
  const nextCommandId = useRef(1)
  const pendingCommand = useRef<PendingCommand | null>(null)
  const commandQueue = useRef<Promise<EditorSurfaceCommandResult>>(Promise.resolve({ commandId: 0 }))
  const surfaceError = useRef<Error | null>(null)
  const surfaceReadyRef = useRef(false)

  useEffect(() => {
    if (noteId === null)
      return
    let active = true
    void runtime.editor.notes.getNote({ noteId }).then(
      (note) => {
        if (active)
          setSession(toSurfaceSession(note))
      },
      (failure: unknown) => {
        if (active)
          setError(toError(failure))
      },
    )
    return () => {
      active = false
    }
  }, [noteId, runtime])

  const issueCommand = useCallback((input: EditorSurfaceCommandInput): Promise<EditorSurfaceCommandResult> => {
    if (surfaceError.current)
      throw surfaceError.current
    if (!surfaceReadyRef.current) {
      if (input.type === 'flush')
        return Promise.resolve({ commandId: 0 })
      throw new Error('Editor is still loading')
    }
    if (pendingCommand.current)
      throw new Error('An Editor command is already running')
    const id = nextCommandId.current++
    return new Promise<EditorSurfaceCommandResult>((resolve, reject) => {
      pendingCommand.current = { id, reject, resolve }
      setCommand({ ...input, id })
    })
  }, [])

  const enqueueCommand = useCallback((input: EditorSurfaceCommandInput) => {
    const result = commandQueue.current.then(() => issueCommand(input))
    commandQueue.current = result.catch(() => ({ commandId: 0 }))
    return result
  }, [issueCommand])

  const enqueueStructureCommand = useCallback(async (
    input: Exclude<EditorSurfaceCommandInput, { type: 'flush' } | { type: 'rename-note' }>,
  ): Promise<EditorSurfaceStructure> => {
    const result = await enqueueCommand(input)
    if (!result.structure)
      throw new Error(`Editor command ${input.type} did not return Note structure`)
    return result.structure
  }, [enqueueCommand])

  useImperativeHandle(props.ref, () => ({
    createEntry: input => enqueueStructureCommand({ ...input, type: 'create-entry' }),
    deleteEntry: input => enqueueStructureCommand({ ...input, type: 'delete-entry' }),
    flush: async () => {
      await enqueueCommand({ type: 'flush' })
    },
    moveEntry: input => enqueueStructureCommand({ ...input, type: 'move-entry' }),
    openTopic: topicId => enqueueStructureCommand({ topicId, type: 'open-topic' }),
    refreshStructure: () => enqueueStructureCommand({ type: 'refresh-structure' }),
    renameEntry: (entryId, label) => enqueueStructureCommand({ entryId, label, type: 'rename-entry' }),
    renameNote: async (title) => {
      await enqueueCommand({ title, type: 'rename-note' })
    },
  }), [enqueueCommand, enqueueStructureCommand])

  useEffect(() => {
    // React Native AppState returns a subscription whose remove method is called below.
    // eslint-disable-next-line react-web-api/no-leaked-event-listener
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active')
        void enqueueCommand({ type: 'flush' }).catch(() => undefined)
    })
    return () => subscription.remove()
  }, [enqueueCommand])

  useEffect(() => () => {
    pendingCommand.current?.reject(new Error('Editor surface closed before the command completed'))
    pendingCommand.current = null
  }, [])

  const onCommandResult = useCallback((result: EditorSurfaceCommandResult) => {
    const pending = pendingCommand.current
    if (!pending || pending.id !== result.commandId)
      return
    pendingCommand.current = null
    setCommand(null)
    if (result.error !== undefined) {
      pending.reject(new Error(result.error))
      return
    }
    if (result.title !== undefined)
      onTitleChanged?.(result.title)
    if (result.structure !== undefined)
      onStructureChanged?.(result.structure)
    pending.resolve(result)
  }, [onStructureChanged, onTitleChanged])

  const onSurfaceError = useCallback((message: string) => {
    const failure = new Error(message)
    surfaceError.current = failure
    setError(failure)
  }, [])

  const onSurfaceReady = useCallback((structure: EditorSurfaceStructure | null) => {
    surfaceReadyRef.current = true
    setSurfaceReady(true)
    onReady?.()
    if (structure)
      onStructureChanged?.(structure)
  }, [onReady, onStructureChanged])

  const saveNote = useCallback(async (
    input: SaveEditorSurfaceInput,
  ): Promise<SaveEditorSurfaceReceipt> => {
    const receipt = await runtime.editor.notes.saveNoteUpdates({
      entries: input.entries,
      ...(input.journalHasUserContent === undefined
        ? {}
        : { journalHasUserContent: input.journalHasUserContent }),
      learningCards: input.learningCards,
      noteId: input.noteId,
      spreadsheets: input.spreadsheets,
      title: input.title,
      topics: input.topics,
      updates: input.updates.map(decodeBinary),
    })
    onSaved?.()
    return { latestSequence: receipt.latestSequence, updatedAt: receipt.updatedAt }
  }, [onSaved, runtime])

  const checkpointNote = useCallback(async (input: CheckpointEditorSurfaceInput): Promise<void> => {
    await runtime.editor.notes.checkpointNote({
      noteId: input.noteId,
      snapshot: decodeBinary(input.snapshot),
      throughSequence: input.throughSequence,
    })
  }, [runtime])

  const openJournal = useCallback(async (input: OpenJournalSurfaceInput): Promise<EditorSurfaceSession> => {
    const opened = await runtime.editor.journals.getOrCreate({
      entries: input.entries,
      id: input.id,
      journalDate: input.journalDate,
      learningCards: input.learningCards,
      snapshot: decodeBinary(input.snapshot),
      spreadsheets: input.spreadsheets,
      topics: input.topics,
    })
    return toSurfaceSession(opened.note)
  }, [runtime])

  const onTopicOpened = useCallback(async (input: { noteId: string, topicId: string }) => {
    await runtime.editor.notes.recordNoteOpened(input)
  }, [runtime])

  const resolveAsset = useCallback((source: string) => runtime.assets.resolve(source), [runtime])
  const saveImage = useCallback(async (input: SaveEditorImageInput) => (
    runtime.assets.saveImage({
      data: decodeBinary(input.data),
      fileName: input.fileName,
      mimeType: input.mimeType,
    })
  ), [runtime])

  if (error) {
    return (
      <View style={styles.centered}>
        <Text selectable style={styles.error}>{error.message}</Text>
      </View>
    )
  }
  if (props.kind === 'note' && !session) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    )
  }

  return (
    <View style={styles.root}>
      {props.kind === 'journal'
        ? (
            <EditorDomSurface
              checkpointNote={checkpointNote}
              command={command}
              dom={immersive ? immersiveDom : dom}
              immersive={immersive}
              journalDate={props.journalDate}
              kind="journal"
              language={language}
              onCommandResult={onCommandResult}
              onSurfaceError={onSurfaceError}
              onSurfaceReady={onSurfaceReady}
              onTopicOpened={onTopicOpened}
              openJournal={openJournal}
              resolveAsset={resolveAsset}
              saveImage={saveImage}
              saveNote={saveNote}
            />
          )
        : (
            <EditorDomSurface
              checkpointNote={checkpointNote}
              command={command}
              dom={immersive ? immersiveDom : dom}
              immersive={immersive}
              kind="note"
              language={language}
              onCommandResult={onCommandResult}
              onSurfaceError={onSurfaceError}
              onSurfaceReady={onSurfaceReady}
              onTopicOpened={onTopicOpened}
              resolveAsset={resolveAsset}
              saveImage={saveImage}
              saveNote={saveNote}
              session={session!}
            />
          )}
      {!surfaceReady
        ? (
            <View
              accessibilityLabel={t('loadingEditor')}
              accessibilityRole="progressbar"
              style={styles.surfaceLoading}
            >
              <ActivityIndicator color={colors.accent} />
            </View>
          )
        : null}
    </View>
  )
}
