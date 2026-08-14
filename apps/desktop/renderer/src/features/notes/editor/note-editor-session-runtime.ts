import type {
  DesktopNote,
  DesktopNoteExternalUpdate,
  DesktopNoteWriteReceipt,
} from '@memorilo/desktop-preload'
import type {
  EditorNote,
  EditorNoteChange,
  EditorTopicDocument,
  EditorWhiteboardTopicDocument,
  NoteEntrySnapshot,
} from '@memorilo/editor/note'
import type { EditorNoteSessionCache } from '../note-runtime'
import { createEditorNote } from '@memorilo/editor/note'
import { Cause, Effect, Exit } from 'effect'
import { applyExternalNoteUpdate } from '../note-runtime'

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

export type EditorTopicResolver<TStored extends DesktopNote> = (
  note: EditorNote,
  stored: TStored,
) => EditorTopicDocument | EditorWhiteboardTopicDocument

export interface EditorNoteSessionPersistence {
  enqueue: (change: EditorNoteChange) => void
  getPendingChanges: () => readonly EditorNoteChange[]
  replacePending: (update: Uint8Array) => void
}

export type EditorNoteSessionRuntimeEvent<TStored extends DesktopNote>
  = | {
    diagnostics?: string
    opened: EditorNoteSessionOpened<TStored>
    source: 'external' | 'local' | 'metadata' | 'restored' | 'saved'
    type: 'opened'
  }
  | {
    diagnostics: string
    error: unknown
    targetId: string
    type: 'restore-failed'
  }

interface EditorNoteSessionRuntimeOptions<TStored extends DesktopNote> {
  cache?: EditorNoteSessionCache
  noteId: string
  onEvent: (event: EditorNoteSessionRuntimeEvent<TStored>) => void
  persistence: EditorNoteSessionPersistence
  preferredTopicId?: string
  resolveTopic: EditorTopicResolver<TStored>
}

interface ValidatedEditorNote {
  entries: readonly NoteEntrySnapshot[]
  topic: EditorTopicDocument | EditorWhiteboardTopicDocument
}

export function toEditorNoteError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

function validateEditorNote<TStored extends DesktopNote>(
  note: EditorNote,
  stored: TStored,
  resolveTopic: EditorTopicResolver<TStored>,
): Effect.Effect<ValidatedEditorNote, Error> {
  return Effect.gen(function* () {
    const entries = yield* Effect.try({
      catch: toEditorNoteError,
      try: () => note.getEntries(),
    })
    for (const entry of entries) {
      if (entry.kind === 'topic')
        yield* note.validateTopic(entry.id)
    }

    const topic = yield* Effect.try({
      catch: toEditorNoteError,
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
      sections.push(`Invalid Topic JSON:\nUnable to project Topic: ${toEditorNoteError(error).message}`)
    }
  }
  sections.push(`Effect validation output:\n${effectOutput}`)
  return sections.join('\n\n')
}

export class EditorNoteSessionRuntime<TStored extends DesktopNote> {
  readonly #cache: EditorNoteSessionCache | undefined
  readonly #noteId: string
  readonly #onEvent: (event: EditorNoteSessionRuntimeEvent<TStored>) => void
  readonly #persistence: EditorNoteSessionPersistence
  readonly #preferredTopicId: string | undefined
  readonly #resolveTopic: EditorTopicResolver<TStored>
  #closed = false
  #latestValidSnapshot: Uint8Array | null = null
  #opened: EditorNoteSessionOpened<TStored> | null = null
  #restoring = false
  #unsubscribe: (() => void) | undefined

  constructor(options: EditorNoteSessionRuntimeOptions<TStored>) {
    this.#cache = options.cache
    this.#noteId = options.noteId
    this.#onEvent = options.onEvent
    this.#persistence = options.persistence
    this.#preferredTopicId = options.preferredTopicId
    this.#resolveTopic = options.resolveTopic
  }

  open(stored: TStored): EditorNoteSessionOpened<TStored> {
    this.#assertOpen()
    if (stored.id !== this.#noteId)
      throw new Error(`Editor session expected Note ${this.#noteId}, but the loader returned Note ${stored.id}`)

    const persisted = createEditorNote({
      id: stored.id,
      snapshot: stored.snapshot,
      title: stored.title,
    })
    for (const change of this.#persistence.getPendingChanges())
      persisted.importUpdates(change.update)

    const cached = this.#cache?.get(this.#noteId)
    let note = persisted
    if (cached) {
      const candidate = createEditorNote({ id: cached.id, snapshot: cached.exportSnapshot() })
      candidate.importUpdates(persisted.exportUpdates(candidate.getVersion()))
      Effect.runSync(validateEditorNote(candidate, stored, this.#resolveTopic))
      cached.importUpdates(candidate.exportUpdates(cached.getVersion()))
      note = cached
    }

    const projection = Effect.runSync(validateEditorNote(note, stored, this.#resolveTopic))
    const opened = { ...projection, note, stored }
    this.#opened = opened
    this.#latestValidSnapshot = note.exportSnapshot()
    this.#cache?.set(note)
    this.#unsubscribe = note.subscribe(change => this.#handleLocalChange(change))
    return opened
  }

  close(): void {
    if (this.#closed)
      return
    this.#closed = true
    this.#unsubscribe?.()
    this.#unsubscribe = undefined
    this.#opened = null
    this.#latestValidSnapshot = null
  }

  applyExternal(external: DesktopNoteExternalUpdate): boolean {
    const opened = this.#opened
    if (this.#closed || !opened || external.noteId !== opened.note.id)
      return false

    const applied = applyExternalNoteUpdate(opened.note, external)
    if (!applied)
      return false
    const validation = Effect.runSyncExit(validateEditorNote(opened.note, opened.stored, this.#resolveTopic))
    if (Exit.isFailure(validation)) {
      this.#restoreAfterInvalidChange(opened.note, Cause.pretty(validation.cause))
      return true
    }

    this.#latestValidSnapshot = applied.snapshot
    const stored = { ...opened.stored, updatedAt: applied.updatedAt }
    const next = this.#openedFromProjection(opened, validation.value, stored)
    this.#opened = next
    this.#publish({ opened: next, source: 'external', type: 'opened' })
    return true
  }

  applyReceipt(noteId: string, receipt: DesktopNoteWriteReceipt): boolean {
    const opened = this.#opened
    if (this.#closed || !opened || opened.note.id !== noteId)
      return false
    const projection = Effect.runSync(validateEditorNote(opened.note, opened.stored, this.#resolveTopic))
    const stored = { ...opened.stored, updatedAt: receipt.updatedAt }
    const next = this.#openedFromProjection(opened, projection, stored)
    this.#opened = next
    this.#publish({ opened: next, source: 'saved', type: 'opened' })
    return true
  }

  updateStored(expectedNote: EditorNote, patch: EditorStoredNotePatch<TStored>): boolean {
    const opened = this.#opened
    if (this.#closed || !opened || opened.note !== expectedNote || opened.stored.id !== expectedNote.id)
      return false
    const next = { ...opened, stored: { ...opened.stored, ...patch } }
    this.#opened = next
    this.#publish({ opened: next, source: 'metadata', type: 'opened' })
    return true
  }

  #assertOpen(): void {
    if (this.#closed)
      throw new Error(`Editor Note session ${this.#noteId} is closed`)
  }

  #handleLocalChange(change: EditorNoteChange): void {
    const opened = this.#opened
    if (this.#closed || this.#restoring || !opened || change.noteId !== opened.note.id)
      return

    const validation = Effect.runSyncExit(validateEditorNote(opened.note, opened.stored, this.#resolveTopic))
    if (Exit.isFailure(validation)) {
      this.#restoreAfterInvalidChange(opened.note, Cause.pretty(validation.cause))
      return
    }

    this.#persistence.enqueue(change)
    this.#latestValidSnapshot = opened.note.exportSnapshot()
    const next = this.#openedFromProjection(opened, validation.value, opened.stored)
    this.#opened = next
    this.#publish({ opened: next, source: 'local', type: 'opened' })
  }

  #openedFromProjection(
    current: EditorNoteSessionOpened<TStored>,
    projection: ValidatedEditorNote,
    stored: TStored,
  ): EditorNoteSessionOpened<TStored> {
    return {
      entries: projection.entries,
      note: current.note,
      stored,
      topic: current.topic.topicId === projection.topic.topicId ? current.topic : projection.topic,
    }
  }

  #publish(event: EditorNoteSessionRuntimeEvent<TStored>): void {
    try {
      this.#onEvent(event)
    }
    catch (error) {
      // Persistence and CRDT state must not depend on a renderer observer.
      console.error(`Editor Note session observer failed for Note ${this.#noteId}`, error)
    }
  }

  #restoreAfterInvalidChange(note: EditorNote, effectOutput: string): void {
    const opened = this.#opened
    const snapshot = this.#latestValidSnapshot
    if (!opened || !snapshot || this.#restoring)
      return
    const targetId = diagnosticTopicId(note, this.#preferredTopicId) ?? note.id
    const diagnostics = formatTopicValidationDiagnostics(
      note,
      targetId,
      effectOutput,
    )

    this.#restoring = true
    try {
      const restored = createEditorNote({ id: note.id, snapshot })
      const projection = Effect.runSync(validateEditorNote(restored, opened.stored, this.#resolveTopic))
      const next = { ...projection, note: restored, stored: opened.stored }
      const recoveryUpdate = restored.exportUpdates()

      this.#persistence.replacePending(recoveryUpdate)
      this.#unsubscribe?.()
      this.#opened = next
      this.#latestValidSnapshot = restored.exportSnapshot()
      this.#cache?.set(restored)
      this.#unsubscribe = restored.subscribe(change => this.#handleLocalChange(change))
      this.#publish({ diagnostics, opened: next, source: 'restored', type: 'opened' })
    }
    catch (error) {
      this.#publish({ diagnostics, error, targetId, type: 'restore-failed' })
    }
    finally {
      this.#restoring = false
    }
  }
}
