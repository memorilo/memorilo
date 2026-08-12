import type { DesktopNote } from '@memorilo/desktop-preload'
import type {
  EditorNote,
  EditorNoteChange,
  EditorTopicDocument,
  EditorWhiteboardTopicDocument,
  NoteEntrySnapshot,
} from '@memorilo/editor'
import type { EditorNoteSessionCache } from '../editor-note-session-cache'
import { createEditorNote, demoEditorAdapters } from '@memorilo/editor'
import { Cause, Effect, Exit } from 'effect'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useNotePersistence } from '../note-persistence-hooks'
import { applyExternalNoteUpdate } from './-note-external-update'

export interface EditorNoteSessionOpened<TStored extends DesktopNote = DesktopNote> {
  entries: readonly NoteEntrySnapshot[]
  note: EditorNote
  stored: TStored
  topic: EditorTopicDocument | EditorWhiteboardTopicDocument
}

export interface TopicValidationError {
  diagnostics: string
  message: string
}

export type EditorStoredNotePatch<TStored extends DesktopNote> = Partial<
  Omit<TStored, 'id' | 'journalDate' | 'kind' | 'snapshot'>
>

export interface EditorNoteSession<TStored extends DesktopNote = DesktopNote> {
  loadError: string | null
  opened: EditorNoteSessionOpened<TStored> | null
  saveError: string | null
  updateStored: (
    expectedNote: EditorNote,
    patch: EditorStoredNotePatch<TStored>,
  ) => boolean
  validationError: TopicValidationError | null
}

type EditorTopicResolver<TStored extends DesktopNote> = (
  note: EditorNote,
  stored: TStored,
) => EditorTopicDocument | EditorWhiteboardTopicDocument

interface EditorNoteSessionBaseOptions<TStored extends DesktopNote> {
  cache?: EditorNoteSessionCache
  loadNote: () => Promise<TStored>
  noteId: string
  onExternalUpdate?: (opened: EditorNoteSessionOpened<TStored>) => void
  onOpened?: (opened: EditorNoteSessionOpened<TStored>) => Promise<void> | void
  onSaved?: (opened: EditorNoteSessionOpened<TStored>) => void
}

type EditorNoteSessionTopicOptions<TStored extends DesktopNote>
  = | {
    resolveTopic?: never
    topicId: string
    topicKey?: never
  }
  | {
    resolveTopic: EditorTopicResolver<TStored>
    topicId?: never
    topicKey: string
  }

export type UseEditorNoteSessionOptions<TStored extends DesktopNote>
  = EditorNoteSessionBaseOptions<TStored> & EditorNoteSessionTopicOptions<TStored>

interface ValidatedEditorNote {
  entries: readonly NoteEntrySnapshot[]
  topic: EditorTopicDocument | EditorWhiteboardTopicDocument
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

function validateEditorNote<TStored extends DesktopNote>(
  note: EditorNote,
  stored: TStored,
  resolveTopic: EditorTopicResolver<TStored>,
): Effect.Effect<ValidatedEditorNote, Error> {
  return Effect.gen(function* () {
    const entries = yield* Effect.try({
      catch: toError,
      try: () => note.getEntries(),
    })
    for (const entry of entries) {
      if (entry.kind === 'topic')
        yield* note.validateTopic(entry.id)
    }

    const topic = yield* Effect.try({
      catch: toError,
      try: () => resolveTopic(note, stored),
    })
    if (topic.noteId !== note.id)
      return yield* Effect.fail(new Error(`Topic ${topic.topicId} does not belong to Note ${note.id}`))
    if (!entries.some(entry => entry.kind === 'topic' && entry.id === topic.topicId))
      return yield* Effect.fail(new Error(`Note ${note.id} does not contain Topic ${topic.topicId}`))

    return { entries, topic }
  })
}

function diagnosticTopicId(note: EditorNote, preferredTopicId: string | undefined): string | null {
  if (preferredTopicId !== undefined)
    return preferredTopicId
  try {
    return note.getEntries().find(entry => entry.kind === 'topic')?.id ?? null
  }
  catch {
    return null
  }
}

function formatTopicValidationDiagnostics(
  note: EditorNote,
  topicId: string | null,
  effectOutput: string,
): string {
  const sections = [`Note ID: ${note.id}`]
  if (topicId !== null) {
    sections.push(`Topic ID: ${topicId}`)
    try {
      const input = note.getTopicValidationInput(topicId)
      sections.push(`Invalid Topic JSON:\n${JSON.stringify(input, null, 2)}`)
    }
    catch (error) {
      sections.push(`Invalid Topic JSON:\nUnable to project Topic: ${toError(error).message}`)
    }
  }
  sections.push(`Effect validation output:\n${effectOutput}`)
  return sections.join('\n\n')
}

function errorMessage(error: unknown | null): string | null {
  if (error === null)
    return null
  return toError(error).message
}

export function desktopEditorAdapters(networkImagePasteBehavior: 'download' | 'url') {
  return {
    ...demoEditorAdapters,
    importNetworkImage: async (source: string) => (await window.desktop.importNetworkImage({ source })).src,
    networkImagePasteBehavior,
    uploadImage: async ({ file, onProgress }: Parameters<typeof demoEditorAdapters.uploadImage>[0]) => {
      const total = Math.max(file.size, 1)
      onProgress({ loaded: 0, total })
      const result = await window.desktop.saveImage({
        data: new Uint8Array(await file.arrayBuffer()),
        fileName: file.name,
        mimeType: file.type,
      })
      onProgress({ loaded: total, total })
      return result.src
    },
  }
}

export function useEditorNoteSession<TStored extends DesktopNote>({
  cache,
  loadNote,
  noteId,
  onExternalUpdate,
  onOpened,
  onSaved,
  resolveTopic,
  topicId,
  topicKey,
}: UseEditorNoteSessionOptions<TStored>): EditorNoteSession<TStored> {
  const { t } = useTranslation('editor')
  const [opened, setOpened] = useState<EditorNoteSessionOpened<TStored> | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<TopicValidationError | null>(null)
  const persistence = useNotePersistence(noteId)
  const { discard, enqueue, getPendingChanges, subscribeReceipts } = persistence
  const noteRef = useRef<EditorNote | null>(null)
  const storedRef = useRef<TStored | null>(null)
  const restoringRef = useRef(false)
  const unsubscribeRef = useRef<(() => void) | undefined>(undefined)
  const latestValidSnapshotRef = useRef<Uint8Array | null>(null)
  const handleNoteChangeRef = useRef<(change: EditorNoteChange) => void>(() => undefined)
  const resolveTopicRef = useRef(resolveTopic)
  const onExternalUpdateRef = useRef(onExternalUpdate)
  const onOpenedRef = useRef(onOpened)
  const onSavedRef = useRef(onSaved)
  resolveTopicRef.current = resolveTopic
  onExternalUpdateRef.current = onExternalUpdate
  onOpenedRef.current = onOpened
  onSavedRef.current = onSaved

  const resolveTopicDocument = useCallback<EditorTopicResolver<TStored>>((note, stored) => {
    if (topicId !== undefined) {
      const topic = note.getEntries().find(
        (entry): entry is NoteEntrySnapshot & { kind: 'topic' } => entry.kind === 'topic' && entry.id === topicId,
      )
      if (!topic)
        throw new Error(`Note ${note.id} does not contain Topic ${topicId}`)
      return topic.topicType === 'whiteboard'
        ? note.getWhiteboardTopic(topic.id)
        : note.getTopic(topic.id)
    }
    const currentResolver = resolveTopicRef.current
    if (!currentResolver)
      throw new Error(`No Topic resolver was provided for Note ${note.id}`)
    return currentResolver(note, stored)
  }, [topicId])

  const rebuildFromLatestValidSnapshot = useCallback((nextValidationError: TopicValidationError) => {
    const current = noteRef.current
    const snapshot = latestValidSnapshotRef.current
    const stored = storedRef.current
    if (!current || !snapshot || !stored || restoringRef.current)
      return

    restoringRef.current = true
    discard()
    unsubscribeRef.current?.()
    unsubscribeRef.current = undefined
    try {
      const restored = createEditorNote({ id: current.id, snapshot })
      const restoredProjection = Effect.runSync(validateEditorNote(restored, stored, resolveTopicDocument))
      noteRef.current = restored
      latestValidSnapshotRef.current = restored.exportSnapshot()
      cache?.set(restored)
      enqueue({ noteId: restored.id, update: restored.exportUpdates() })
      unsubscribeRef.current = restored.subscribe(change => handleNoteChangeRef.current(change))
      setOpened({
        ...restoredProjection,
        note: restored,
        stored,
      })
      setValidationError(nextValidationError)
    }
    catch (error) {
      const restoreTargetId = diagnosticTopicId(current, topicId) ?? current.id
      console.error(`Failed to restore the latest valid snapshot for Note ${current.id}`, error)
      setValidationError({
        diagnostics: nextValidationError.diagnostics,
        message: t('restoreFailedMessage', { topicId: restoreTargetId }),
      })
    }
    finally {
      restoringRef.current = false
    }
  }, [cache, discard, enqueue, resolveTopicDocument, t, topicId])

  const handleNoteChange = useCallback((change: EditorNoteChange) => {
    if (restoringRef.current)
      return
    const note = noteRef.current
    const stored = storedRef.current
    if (!note || !stored)
      return

    const validationExit = Effect.runSyncExit(validateEditorNote(note, stored, resolveTopicDocument))
    if (Exit.isFailure(validationExit)) {
      const effectOutput = Cause.pretty(validationExit.cause)
      console.error('Topic validation failed; restoring the latest valid Note snapshot', effectOutput)
      rebuildFromLatestValidSnapshot({
        diagnostics: formatTopicValidationDiagnostics(
          note,
          diagnosticTopicId(note, topicId),
          effectOutput,
        ),
        message: t('invalidStructureReverted'),
      })
      return
    }

    setValidationError(null)
    latestValidSnapshotRef.current = note.exportSnapshot()
    enqueue(change)
  }, [enqueue, rebuildFromLatestValidSnapshot, resolveTopicDocument, t, topicId])
  handleNoteChangeRef.current = handleNoteChange

  useEffect(() => subscribeReceipts((savedNoteId, receipt) => {
    const currentNote = noteRef.current
    const currentStored = storedRef.current
    if (currentNote?.id !== savedNoteId || !currentStored)
      return
    const projection = Effect.runSync(validateEditorNote(
      currentNote,
      currentStored,
      resolveTopicDocument,
    ))
    const stored = { ...currentStored, updatedAt: receipt.updatedAt }
    const nextOpened: EditorNoteSessionOpened<TStored> = {
      ...projection,
      note: currentNote,
      stored,
    }
    storedRef.current = stored
    setOpened((current) => {
      if (!current || current.note !== currentNote)
        return current
      return nextOpened
    })
    onSavedRef.current?.(nextOpened)
  }), [resolveTopicDocument, subscribeReceipts])

  useEffect(() => window.desktop.subscribeNoteUpdates((external) => {
    const note = noteRef.current
    const stored = storedRef.current
    if (!note || !stored || note.id !== external.noteId)
      return
    try {
      const applied = applyExternalNoteUpdate(note, external)
      if (!applied)
        return
      const validationExit = Effect.runSyncExit(validateEditorNote(note, stored, resolveTopicDocument))
      if (Exit.isFailure(validationExit)) {
        const effectOutput = Cause.pretty(validationExit.cause)
        console.error('External Topic validation failed; restoring the latest valid Note snapshot', effectOutput)
        rebuildFromLatestValidSnapshot({
          diagnostics: formatTopicValidationDiagnostics(
            note,
            diagnosticTopicId(note, topicId),
            effectOutput,
          ),
          message: t('invalidStructureReverted'),
        })
        return
      }

      latestValidSnapshotRef.current = applied.snapshot
      const nextStored = { ...stored, updatedAt: applied.updatedAt }
      const nextOpened: EditorNoteSessionOpened<TStored> = {
        ...validationExit.value,
        note,
        stored: nextStored,
      }
      storedRef.current = nextStored
      setOpened((current) => {
        if (!current || current.note !== note)
          return current
        return nextOpened
      })
      onExternalUpdateRef.current?.(nextOpened)
    }
    catch (error) {
      console.error(`Failed to apply external update for Note ${external.noteId}`, error)
    }
  }), [rebuildFromLatestValidSnapshot, resolveTopicDocument, t, topicId])

  const resetViewState = useCallback(() => {
    setOpened(null)
    setLoadError(null)
    setValidationError(null)
  }, [])

  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (active)
        resetViewState()
    })

    void (async () => {
      const stored = await loadNote()
      if (!active)
        return
      if (stored.id !== noteId) {
        throw new Error(
          `Editor session expected Note ${noteId}, but the loader returned Note ${stored.id}`,
        )
      }
      const restoredNote = createEditorNote({
        id: stored.id,
        snapshot: stored.snapshot,
        title: stored.title,
      })
      for (const change of getPendingChanges())
        restoredNote.importUpdates(change.update)
      const cachedNote = cache?.get(noteId)
      const note = cachedNote ?? restoredNote
      if (cachedNote) {
        // Merge only remote operations the cached Loro session has not seen. Importing a
        // complete snapshot here would reset the UndoManager retained by the Journal LRU.
        note.importUpdates(restoredNote.exportUpdates(note.getVersion()))
      }
      if (!active)
        return

      const projection = Effect.runSync(validateEditorNote(note, stored, resolveTopicDocument))
      const nextOpened = {
        ...projection,
        note,
        stored,
      }
      await onOpenedRef.current?.(nextOpened)
      if (!active)
        return

      noteRef.current = note
      storedRef.current = stored
      latestValidSnapshotRef.current = note.exportSnapshot()
      cache?.set(note)
      unsubscribeRef.current = note.subscribe(handleNoteChange)
      setOpened(nextOpened)
    })().catch((error) => {
      if (active)
        setLoadError(toError(error).message)
    })

    return () => {
      active = false
      unsubscribeRef.current?.()
      unsubscribeRef.current = undefined
      noteRef.current = null
      storedRef.current = null
      latestValidSnapshotRef.current = null
    }
  }, [
    cache,
    getPendingChanges,
    handleNoteChange,
    loadNote,
    noteId,
    resetViewState,
    resolveTopicDocument,
    topicKey,
  ])

  const updateStored = useCallback((
    expectedNote: EditorNote,
    patch: EditorStoredNotePatch<TStored>,
  ): boolean => {
    const currentNote = noteRef.current
    const currentStored = storedRef.current
    if (!currentNote || !currentStored || currentNote !== expectedNote || currentStored.id !== expectedNote.id)
      return false

    const nextStored = { ...currentStored, ...patch }
    storedRef.current = nextStored
    setOpened(current => current && current.note === currentNote
      ? { ...current, stored: nextStored }
      : current)
    return true
  }, [])

  return {
    loadError,
    opened,
    saveError: errorMessage(persistence.error),
    updateStored,
    validationError,
  }
}
