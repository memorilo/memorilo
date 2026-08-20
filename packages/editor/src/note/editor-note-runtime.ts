import type { UndoManager as LoroUndoManager } from 'loro-crdt'
import type {
  CreateBookTopicInput,
  CreateEditorNoteOptions,
  CreateTopicInput,
} from './editor-note'
import { LoroDoc, UndoManager } from 'loro-crdt'
import { importEditorNoteHistory } from './editor-note-collaboration-runtime'
import {
  NOTE_LEARNING_ENABLED_KEY,
  NOTE_META_KEY,
  NOTE_SCHEMA_VERSION,
  NOTE_UNDO_BOUNDARY_KEY,
  readBoolean,
  readString,
} from './editor-note-crdt'
import { projectEditorNote } from './editor-note-projection'
import { readTopicValidationInput, validateTopicInput } from './editor-note-topic-documents'
import { createInitialTopicNode, createTopicNode } from './editor-note-topic-factory'
import { normalizeNonEmptyString } from './editor-note-validation'

export interface EditorNoteDocument {
  readonly doc: LoroDoc
  readonly noteId: string
  readonly undoManager?: LoroUndoManager
}

function readNoteTitle(doc: LoroDoc): string {
  return readString(doc.getMap(NOTE_META_KEY), 'title', 'Note title')
}

function initializeNote(
  doc: LoroDoc,
  id: string,
  learningEnabled: boolean,
  title: string,
  initialTopicHeading?: string,
  initialTopic?: Omit<CreateTopicInput, 'index' | 'parentId'>,
  initialBookTopic?: Omit<CreateBookTopicInput, 'index' | 'parentId'>,
): void {
  const meta = doc.getMap(NOTE_META_KEY)
  meta.set('id', id)
  meta.set('schemaVersion', NOTE_SCHEMA_VERSION)
  meta.set(NOTE_LEARNING_ENABLED_KEY, learningEnabled)
  meta.set('title', title)
  if (initialBookTopic !== undefined)
    createTopicNode(doc, initialBookTopic, undefined, initialBookTopic.book)
  else if (initialTopic !== undefined)
    createTopicNode(doc, initialTopic)
  else
    createInitialTopicNode(doc, initialTopicHeading)
  doc.commit({ origin: 'sys:init-note' })
}

function validateRestoredNote(doc: LoroDoc, expectedId: string): void {
  const meta = doc.getMap(NOTE_META_KEY)
  const id = readString(meta, 'id', 'Note id')
  if (id !== expectedId)
    throw new Error(`Stored Note id ${id} does not match requested Note ${expectedId}`)
  const schemaVersion = meta.get('schemaVersion')
  if (schemaVersion !== NOTE_SCHEMA_VERSION)
    throw new Error(`Unsupported Note schema version: ${String(schemaVersion)}`)
  readNoteTitle(doc)
  readBoolean(meta, NOTE_LEARNING_ENABLED_KEY, 'Note learning enabled')

  const document: EditorNoteDocument = { doc, noteId: expectedId }
  for (const entry of projectEditorNote(doc).entries) {
    if (entry.kind === 'topic')
      validateTopicInput(readTopicValidationInput(document, entry.id))
  }
}

function assertInitialOptions(options: CreateEditorNoteOptions, restoring: boolean): void {
  if (restoring && options.initialTopicHeading !== undefined)
    throw new TypeError('Initial Topic heading is only valid when creating a new Note')
  if (restoring && options.initialTopic !== undefined)
    throw new TypeError('Initial Topic is only valid when creating a new Note')
  if (restoring && options.initialBookTopic !== undefined)
    throw new TypeError('Initial BookTopic is only valid when creating a new Note')

  const initialTopicOptions = [
    options.initialTopicHeading !== undefined,
    options.initialTopic !== undefined,
    options.initialBookTopic !== undefined,
  ].filter(Boolean).length
  if (initialTopicOptions > 1)
    throw new TypeError('A new Note accepts only one initial Topic option')
}

export class EditorNoteRuntime implements EditorNoteDocument {
  readonly doc: LoroDoc
  readonly noteId: string
  readonly undoManager: LoroUndoManager

  private constructor(doc: LoroDoc, noteId: string) {
    this.doc = doc
    this.noteId = noteId
    this.undoManager = new UndoManager(doc, { excludeOriginPrefixes: ['reader:', 'sys:', 'ui:'] })
  }

  static open(options: CreateEditorNoteOptions): EditorNoteRuntime {
    const noteId = normalizeNonEmptyString(options.id, 'Note id')
    const doc = new LoroDoc()
    doc.configTextStyle({
      bold: { expand: 'after' },
      code: { expand: 'none' },
      cloze: { expand: 'none' },
      inlineHighlight: { expand: 'both' },
      italic: { expand: 'after' },
      link: { expand: 'none' },
      strike: { expand: 'after' },
      underline: { expand: 'after' },
    })

    const hasSnapshot = options.snapshot !== null && options.snapshot !== undefined
    const hasUpdates = (options.updates?.length ?? 0) > 0
    assertInitialOptions(options, hasSnapshot || hasUpdates)
    importEditorNoteHistory(doc, options.snapshot, options.updates)

    if (hasSnapshot || hasUpdates) {
      validateRestoredNote(doc, noteId)
    }
    else {
      initializeNote(
        doc,
        noteId,
        options.learningEnabled ?? true,
        normalizeNonEmptyString(options.title ?? 'Untitled', 'Note title'),
        options.initialTopicHeading,
        options.initialTopic,
        options.initialBookTopic,
      )
    }
    return new EditorNoteRuntime(doc, noteId)
  }

  getTitle(): string {
    return readNoteTitle(this.doc)
  }

  getLearningEnabled(): boolean {
    return readBoolean(this.doc.getMap(NOTE_META_KEY), NOTE_LEARNING_ENABLED_KEY, 'Note learning enabled')
  }

  setLearningEnabled(enabled: boolean): void {
    if (typeof enabled !== 'boolean')
      throw new TypeError('Note learning enabled must be a boolean')
    if (enabled === this.getLearningEnabled())
      return
    this.runMutation(() => {
      this.doc.getMap(NOTE_META_KEY).set(NOTE_LEARNING_ENABLED_KEY, enabled)
      this.doc.commit({ origin: 'note:learning' })
    })
  }

  rename(title: string): void {
    this.runMutation(() => {
      this.doc.getMap(NOTE_META_KEY).set('title', normalizeNonEmptyString(title, 'Note title'))
      this.doc.commit({ origin: 'note:rename' })
    })
  }

  runMutation<Result>(operation: () => Result): Result {
    this.undoManager.groupStart()
    let result: Result
    try {
      result = operation()
    }
    finally {
      this.undoManager.groupEnd()
    }

    const meta = this.doc.getMap(NOTE_META_KEY)
    const current = meta.get(NOTE_UNDO_BOUNDARY_KEY)
    if (current !== undefined && (typeof current !== 'number' || !Number.isSafeInteger(current) || current < 0))
      throw new Error('Note undo boundary must be a non-negative safe integer')
    meta.set(NOTE_UNDO_BOUNDARY_KEY, (current ?? 0) + 1)
    this.doc.commit({ origin: 'sys:undo-boundary' })
    return result
  }
}
