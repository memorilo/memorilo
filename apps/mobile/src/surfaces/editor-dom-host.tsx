import type { StoredNote } from '@memorilo/editor-storage'
import type { DOMProps } from 'expo/dom'
import type { Ref } from 'react'
import type {
  CheckpointEditorSurfaceInput,
  EditorSurfaceCommand,
  EditorSurfaceCommandResult,
  EditorSurfaceSession,
  OpenJournalSurfaceInput,
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
import { ActivityIndicator, AppState, StyleSheet, Text, View } from 'react-native'
import { colors } from '@/ui/theme'
import EditorDomSurface from './editor-dom-surface'
import { decodeBinary, encodeBinary } from './editor-surface-contract'

interface EditorDomHostBaseProps {
  onSaved?: () => void
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
  flush: () => Promise<void>
  renameNote: (title: string) => Promise<void>
}

interface PendingCommand {
  id: number
  reject: (error: Error) => void
  resolve: () => void
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
  },
})

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

export function EditorDomHost(props: EditorDomHostProps) {
  const { onSaved, onTitleChanged, runtime } = props
  const noteId = props.kind === 'note' ? props.noteId : null
  const [session, setSession] = useState<EditorSurfaceSession | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [command, setCommand] = useState<EditorSurfaceCommand | null>(null)
  const nextCommandId = useRef(1)
  const pendingCommand = useRef<PendingCommand | null>(null)
  const commandQueue = useRef<Promise<void>>(Promise.resolve())

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

  const issueCommand = useCallback((input: { type: 'flush' } | { title: string, type: 'rename-note' }) => {
    if (pendingCommand.current)
      throw new Error('An Editor command is already running')
    const id = nextCommandId.current++
    return new Promise<void>((resolve, reject) => {
      pendingCommand.current = { id, reject, resolve }
      setCommand({ ...input, id })
    })
  }, [])

  const enqueueCommand = useCallback((input: { type: 'flush' } | { title: string, type: 'rename-note' }) => {
    const result = commandQueue.current.then(() => issueCommand(input))
    commandQueue.current = result.catch(() => undefined)
    return result
  }, [issueCommand])

  useImperativeHandle(props.ref, () => ({
    flush: () => enqueueCommand({ type: 'flush' }),
    renameNote: title => enqueueCommand({ title, type: 'rename-note' }),
  }), [enqueueCommand])

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
    pending.resolve()
  }, [onTitleChanged])

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
              dom={dom}
              journalDate={props.journalDate}
              kind="journal"
              onCommandResult={onCommandResult}
              onTopicOpened={onTopicOpened}
              openJournal={openJournal}
              saveNote={saveNote}
            />
          )
        : (
            <EditorDomSurface
              checkpointNote={checkpointNote}
              command={command}
              dom={dom}
              kind="note"
              onCommandResult={onCommandResult}
              onTopicOpened={onTopicOpened}
              saveNote={saveNote}
              session={session!}
            />
          )}
    </View>
  )
}
