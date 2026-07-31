import type { LoroMap, UndoManager as LoroUndoManager } from 'loro-crdt'
import type { NodeJSON } from 'prosekit/core'
import type { EditorModeValue } from '../common/editor-mode'
import type { TopicBlockProjection } from './topic-projection'
import {
  createNodeJsonFromLoroTree,
  initializeLoroTreeFromJson,
} from '@memorilo/loro-prosemirror-tree/model'
import {
  LoroDoc,
  UndoManager,
} from 'loro-crdt'
import { assertEditorMode, EditorMode } from '../common/editor-mode'
import { normalizeOutlineDocument } from '../common/outline-document'
import { projectTopicBlocks } from './topic-projection'

const NOTE_META_KEY = 'noteMeta'
const NOTE_ENTRIES_KEY = 'entries'
const NOTE_SCHEMA_VERSION = 3
const NOTE_UNDO_BOUNDARY_KEY = 'undoBoundary'
const ENTRY_ID_KEY = 'entryId'
const ENTRY_KIND_KEY = 'kind'
const FOLDER_NAME_KEY = 'name'
const TOPIC_TITLE_KEY = 'title'
const TOPIC_EDITOR_MODE_KEY = 'editorMode'
const TOPIC_BLOCK_TREE_KEY = 'blockTreeKey'

export type NoteEntryKind = 'folder' | 'topic'

interface NoteEntryBase {
  id: string
  ordinal: number
  parentId: string | null
}

export interface FolderSnapshot extends NoteEntryBase {
  kind: 'folder'
  name: string
}

export interface TopicSnapshot extends NoteEntryBase {
  kind: 'topic'
  mode: EditorModeValue
  /** The effective title: the explicit title, or the first content line when it is empty. */
  title: string
}

export type NoteEntrySnapshot = FolderSnapshot | TopicSnapshot

export interface TopicContentProjection {
  blocks: readonly TopicBlockProjection[]
  /** The effective title projected from the Topic's explicit title and content. */
  title: string
  topicId: string
}

export interface EditorNoteChange {
  noteId: string
  update: Uint8Array
}

export interface EditorNoteMutation {
  entriesChanged: boolean
  metadataChanged: boolean
  topicIds: readonly string[]
}

export interface EditorNoteVersion {
  readonly counter: number
  readonly peer: `${number}`
}

export interface CreateFolderInput {
  /** The zero-based position among the parent's children. Appends when omitted. */
  index?: number
  name: string
  /** The containing Folder, or `null`/omitted for a root Folder. Topics are not valid parents. */
  parentId?: string | null
}

export interface CreateTopicInput {
  /** The zero-based position among the parent's children. Appends when omitted. */
  index?: number
  /** Initial ProseMirror content. A canonical empty document is created when omitted. */
  initialContent?: NodeJSON
  mode: EditorModeValue
  /** The containing Topic or Folder, or `null`/omitted for a root Topic. */
  parentId?: string | null
  /** An explicit title. Use an empty string to derive the effective title from the first content line. */
  title: string
}

export interface MoveNoteEntryInput {
  entryId: string
  index?: number
  parentId?: string | null
}

export type DeleteNoteEntryStrategy = 'delete-subtree' | 'promote-children'

export interface DeleteNoteEntryInput {
  entryId: string
  strategy: DeleteNoteEntryStrategy
}

export interface EditorTopicDocument {
  /** Returns the current editor mode stored in the Topic. */
  readonly getMode: () => EditorModeValue
  readonly noteId: string
  /** Changes the Topic's editor mode in the owning Note's LoroDoc. */
  readonly setMode: (mode: EditorModeValue) => void
  /** Subscribes to changes in the owning Note's LoroDoc. */
  readonly subscribe: (listener: () => void) => () => void
  readonly topicId: string
}

/**
 * Owns a Note's authoritative in-memory LoroDoc and exposes Note-level editing operations.
 * Topic documents returned by `getTopic` are lightweight handles over this same LoroDoc.
 */
export interface EditorNote {
  readonly id: string
  /** Checks out a historical version and detaches the Note from its editable latest state. */
  checkout: (version: readonly EditorNoteVersion[]) => void
  /** Returns a time-traveling Note to its editable latest state. */
  checkoutLatest: () => void
  /** Creates a Folder and returns its stable entry ID. */
  createFolder: (input: CreateFolderInput) => string
  /** Atomically creates a Topic entry and its initialized content tree, then returns its stable entry ID. */
  createTopic: (input: CreateTopicInput) => string
  /** Deletes an entry using the requested child-handling strategy. */
  deleteEntry: (input: DeleteNoteEntryInput) => void
  /** Exports a complete snapshot of the current LoroDoc state. */
  exportSnapshot: () => Uint8Array
  /** Exports all updates, or only updates after the supplied version vector. */
  exportUpdates: (from?: readonly EditorNoteVersion[]) => Uint8Array
  /** Returns the current entry projection. Topic snapshots contain effective titles. */
  getEntries: () => readonly NoteEntrySnapshot[]
  /**
   * Returns an editable handle for an existing Topic in this Note.
   * The handle does not copy, synchronize, or persist the Topic.
   */
  getTopic: (topicId: string) => EditorTopicDocument
  /** Returns the current block projection and effective title for an existing Topic. */
  getTopicContent: (topicId: string) => TopicContentProjection
  /** Returns the Note title stored in the LoroDoc. */
  getTitle: () => string
  /** Returns the current Loro version vector in a serializable form. */
  getVersion: () => readonly EditorNoteVersion[]
  /** Imports an idempotent Loro update and describes which projections became dirty. */
  importUpdates: (updates: Uint8Array) => EditorNoteMutation
  /** Reports whether the Note is currently checked out at a historical version. */
  isTimeTraveling: () => boolean
  /** Moves an entry within the Note entry tree. */
  moveEntry: (input: MoveNoteEntryInput) => void
  /** Renames an entry. Topic labels may be empty; Folder names must remain non-empty. */
  renameEntry: (entryId: string, label: string) => void
  /** Replaces the non-empty Note title. */
  renameNote: (title: string) => void
  /** Subscribes to locally generated Loro updates that callers should persist or transmit. */
  subscribe: (listener: (change: EditorNoteChange) => void) => () => void
}

export interface CreateEditorNoteOptions {
  /** The stable Note ID expected in restored data or assigned to a new Note. */
  id: string
  /** Creates the default Topic with this text as its first H1 Block. Only valid for a new Note. */
  initialTopicHeading?: string
  /** A previously exported Note snapshot. */
  snapshot?: Uint8Array | null
  /** The title for a new Note. Defaults to `Untitled` and is ignored when restoring. */
  title?: string
  /** Updates to import after the snapshot, or the complete history when no snapshot is supplied. */
  updates?: readonly Uint8Array[]
}

export interface EditorTopicBinding {
  doc: LoroDoc
  tree: ReturnType<LoroDoc['getTree']>
  topicId: string
  undoManager: LoroUndoManager
}

interface EditorNoteRuntime {
  doc: LoroDoc
  listeners: Set<(change: EditorNoteChange) => void>
  note: EditorNote
  undoManager?: LoroUndoManager
}

interface EditorTopicDocumentRuntime {
  note: EditorNoteRuntime
  topicId: string
}

const noteRuntimes = new WeakMap<EditorNote, EditorNoteRuntime>()
const topicRuntimes = new WeakMap<EditorTopicDocument, EditorTopicDocumentRuntime>()

function assertNonEmpty(value: string, name: string): string {
  const normalized = value.trim()
  if (normalized.length === 0)
    throw new TypeError(`${name} must be a non-empty string`)
  return normalized
}

function validateBinary(value: Uint8Array, name: string): void {
  if (!(value instanceof Uint8Array) || value.byteLength === 0)
    throw new TypeError(`${name} must be a non-empty Uint8Array`)
}

function readString(map: LoroMap, key: string, description: string): string {
  const value = map.get(key)
  if (typeof value !== 'string' || value.length === 0)
    throw new Error(`${description} must be a non-empty string`)
  return value
}

function readTopicTitle(map: LoroMap, description: string): string {
  const value = map.get(TOPIC_TITLE_KEY)
  if (typeof value !== 'string')
    throw new Error(`${description} must be a string`)
  return value
}

function normalizeTopicTitle(value: string): string {
  if (typeof value !== 'string')
    throw new TypeError('Topic title must be a string')
  return value.trim()
}

function readNoteTitle(doc: LoroDoc): string {
  return readString(doc.getMap(NOTE_META_KEY), 'title', 'Note title')
}

function noteTree(doc: LoroDoc) {
  return doc.getTree(NOTE_ENTRIES_KEY)
}

function entryNode(runtime: EditorNoteRuntime, entryId: string) {
  assertNonEmpty(entryId, 'Note entry id')
  const node = noteTree(runtime.doc).getNodes().find(candidate => candidate.data.get(ENTRY_ID_KEY) === entryId)
  if (!node)
    throw new Error(`Unknown NoteEntry: ${entryId}`)
  return node
}

function topicBlockTree(runtime: EditorNoteRuntime, node: ReturnType<typeof entryNode>) {
  const kind = node.data.get(ENTRY_KIND_KEY)
  if (kind !== 'topic')
    throw new TypeError(`NoteEntry ${readString(node.data, ENTRY_ID_KEY, 'NoteEntry id')} is not a Topic`)
  const blockTreeKey = readString(node.data, TOPIC_BLOCK_TREE_KEY, 'Topic Block tree key')
  return runtime.doc.getTree(blockTreeKey)
}

function effectiveTopicTitle(explicitTitle: string, blocks: readonly TopicBlockProjection[]): string {
  if (explicitTitle.length > 0)
    return explicitTitle
  const firstBlock = blocks.at(0)
  if (!firstBlock)
    return ''
  return firstBlock.text.split(/\r?\n/u, 1)[0]?.trim() ?? ''
}

function projectTopicContent(
  blockTree: ReturnType<LoroDoc['getTree']>,
  topicId: string,
  explicitTitle: string,
): TopicContentProjection {
  const document = createNodeJsonFromLoroTree(blockTree) as NodeJSON | undefined
  if (!document)
    throw new Error(`Topic ${topicId} does not contain an initialized document`)
  const blocks = projectTopicBlocks(document)
  return {
    blocks,
    title: effectiveTopicTitle(explicitTitle, blocks),
    topicId,
  }
}

function projectEditorNote(runtime: EditorNoteRuntime, includeTopics = true): {
  entries: readonly NoteEntrySnapshot[]
  topics: readonly TopicContentProjection[]
} {
  const entries: NoteEntrySnapshot[] = []
  const topics: TopicContentProjection[] = []
  const seenEntryIds = new Set<string>()

  const visit = (
    nodes: ReturnType<ReturnType<typeof noteTree>['toArray']>,
    parentId: string | null,
    parentKind: NoteEntryKind | null,
  ): void => {
    nodes.forEach((node, ordinal) => {
      const id = readString(node.meta, ENTRY_ID_KEY, 'NoteEntry id')
      if (seenEntryIds.has(id))
        throw new Error(`Duplicate NoteEntry id: ${id}`)
      seenEntryIds.add(id)
      const kind = node.meta.get(ENTRY_KIND_KEY)

      if (kind === 'folder') {
        if (parentKind === 'topic')
          throw new Error(`Folder ${id} cannot use Topic ${parentId} as its parent`)
        if (node.meta.get(TOPIC_BLOCK_TREE_KEY) !== undefined)
          throw new Error(`Folder ${id} must not have a Topic Block tree`)
        if (node.meta.get(TOPIC_EDITOR_MODE_KEY) !== undefined)
          throw new Error(`Folder ${id} must not have an Editor mode`)
        entries.push({
          id,
          kind,
          name: readString(node.meta, FOLDER_NAME_KEY, `Folder ${id} name`),
          ordinal,
          parentId,
        })
      }
      else if (kind === 'topic') {
        const blockTreeKey = readString(node.meta, TOPIC_BLOCK_TREE_KEY, `Topic ${id} Block tree key`)
        const blockTree = runtime.doc.getTree(blockTreeKey)
        const content = projectTopicContent(blockTree, id, readTopicTitle(node.meta, `Topic ${id} title`))
        entries.push({
          id,
          kind,
          mode: assertEditorMode(node.meta.get(TOPIC_EDITOR_MODE_KEY), `Topic ${id} Editor mode`),
          ordinal,
          parentId,
          title: content.title,
        })

        if (includeTopics)
          topics.push(content)
      }
      else {
        throw new Error(`NoteEntry ${id} has unknown kind: ${String(kind)}`)
      }

      visit(node.children, id, kind)
    })
  }

  visit(noteTree(runtime.doc).toArray(), null, null)
  return { entries, topics }
}

function emitChange(runtime: EditorNoteRuntime, update: Uint8Array): void {
  const change: EditorNoteChange = {
    noteId: runtime.note.id,
    update: new Uint8Array(update),
  }
  runtime.listeners.forEach(listener => listener(change))
}

function resolveParent(runtime: EditorNoteRuntime, parentId: string | null | undefined) {
  if (parentId === null || parentId === undefined)
    return undefined
  return entryNode(runtime, parentId)
}

function assertFolderParent(parent: ReturnType<typeof entryNode> | undefined): void {
  if (parent?.data.get(ENTRY_KIND_KEY) === 'topic') {
    const parentId = readString(parent.data, ENTRY_ID_KEY, 'Topic id')
    throw new TypeError(`Folder cannot use Topic ${parentId} as its parent`)
  }
}

function emptyTopicDocument(): NodeJSON {
  return {
    type: 'doc',
    content: [{ type: 'paragraph' }],
  }
}

function headingTopicDocument(heading: string): NodeJSON {
  return {
    type: 'doc',
    content: [{
      type: 'heading',
      attrs: { level: 1 },
      content: [{ type: 'text', text: assertNonEmpty(heading, 'Initial Topic heading') }],
    }],
  }
}

function mutationRoot(eventPath: readonly unknown[], targetPath: readonly unknown[]): string | undefined {
  const root = eventPath[0] ?? targetPath[0]
  return typeof root === 'string' ? root : undefined
}

function resolveIndex(index: number | undefined): number | undefined {
  if (index === undefined)
    return undefined
  if (!Number.isInteger(index) || index < 0)
    throw new RangeError('NoteEntry index must be a non-negative integer')
  return index
}

function inUndoGroup<Result>(runtime: EditorNoteRuntime, operation: () => Result): Result {
  const undoManager = runtime.undoManager
  if (!undoManager)
    return operation()
  undoManager.groupStart()
  let result: Result
  try {
    result = operation()
  }
  finally {
    undoManager.groupEnd()
  }
  const meta = runtime.doc.getMap(NOTE_META_KEY)
  const current = meta.get(NOTE_UNDO_BOUNDARY_KEY)
  if (current !== undefined && (typeof current !== 'number' || !Number.isSafeInteger(current) || current < 0))
    throw new Error('Note undo boundary must be a non-negative safe integer')
  meta.set(NOTE_UNDO_BOUNDARY_KEY, (current ?? 0) + 1)
  runtime.doc.commit({ origin: 'sys:undo-boundary' })
  return result
}

function createEntryId(): string {
  return crypto.randomUUID()
}

function createTopicNode(
  doc: LoroDoc,
  input: CreateTopicInput,
  parent: ReturnType<typeof entryNode> | undefined,
): string {
  const node = noteTree(doc).createNode(parent?.id, resolveIndex(input.index))
  const entryId = createEntryId()
  node.data.set(ENTRY_ID_KEY, entryId)
  node.data.set(ENTRY_KIND_KEY, 'topic')
  node.data.set(TOPIC_TITLE_KEY, normalizeTopicTitle(input.title))
  node.data.set(TOPIC_EDITOR_MODE_KEY, assertEditorMode(input.mode, 'Topic Editor mode'))
  const blockTreeKey = `topic:${entryId}:blocks`
  const blockTree = doc.getTree(blockTreeKey)
  node.data.set(TOPIC_BLOCK_TREE_KEY, blockTreeKey)
  const initialContent = normalizeOutlineDocument(input.initialContent ?? emptyTopicDocument())
  initializeLoroTreeFromJson(blockTree, initialContent)
  return entryId
}

function initializeNote(doc: LoroDoc, id: string, title: string, initialTopicHeading?: string): void {
  const meta = doc.getMap(NOTE_META_KEY)
  meta.set('id', id)
  meta.set('schemaVersion', NOTE_SCHEMA_VERSION)
  meta.set('title', title)
  createTopicNode(doc, {
    ...(initialTopicHeading === undefined ? {} : { initialContent: headingTopicDocument(initialTopicHeading) }),
    mode: EditorMode.Document,
    title: '',
  }, undefined)
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
  projectEditorNote({
    doc,
    listeners: new Set(),
    note: { id: expectedId } as EditorNote,
  })
}

/**
 * Creates a new Note or restores one from a snapshot and incremental updates.
 *
 * A new Note atomically contains one root Topic in Document mode. The default Topic has an
 * empty explicit title and either a canonical empty document or the requested initial H1, so
 * callers can immediately obtain it through `getEntries()` and pass `getTopic(topicId)` to the Editor.
 */
export function createEditorNote(options: CreateEditorNoteOptions): EditorNote {
  const id = assertNonEmpty(options.id, 'Note id')
  const doc = new LoroDoc()
  doc.configTextStyle({
    bold: { expand: 'after' },
    cloze: { expand: 'none' },
    inlineHighlight: { expand: 'both' },
  })
  const restoring = (options.snapshot !== null && options.snapshot !== undefined)
    || ((options.updates?.length ?? 0) > 0)
  if (restoring && options.initialTopicHeading !== undefined)
    throw new TypeError('Initial Topic heading is only valid when creating a new Note')
  if (options.snapshot !== null && options.snapshot !== undefined) {
    validateBinary(options.snapshot, 'Note snapshot')
    doc.import(options.snapshot)
  }
  for (const update of options.updates ?? []) {
    validateBinary(update, 'Note update')
    doc.import(update)
  }

  let runtime: EditorNoteRuntime
  const note: EditorNote = {
    id,
    getTopic: (topicId) => {
      const normalizedTopicId = assertNonEmpty(topicId, 'Topic id')
      const node = entryNode(runtime, normalizedTopicId)
      topicBlockTree(runtime, node)
      assertEditorMode(node.data.get(TOPIC_EDITOR_MODE_KEY), `Topic ${normalizedTopicId} Editor mode`)
      const document: EditorTopicDocument = {
        getMode: () => {
          const boundNode = entryNode(runtime, normalizedTopicId)
          return assertEditorMode(boundNode.data.get(TOPIC_EDITOR_MODE_KEY), `Topic ${normalizedTopicId} Editor mode`)
        },
        noteId: id,
        setMode: (mode) => {
          const normalizedMode = assertEditorMode(mode, `Topic ${normalizedTopicId} Editor mode`)
          const boundNode = entryNode(runtime, normalizedTopicId)
          if (boundNode.data.get(TOPIC_EDITOR_MODE_KEY) === normalizedMode)
            return
          boundNode.data.set(TOPIC_EDITOR_MODE_KEY, normalizedMode)
          doc.commit({ origin: 'ui:set-topic-editor-mode' })
        },
        subscribe: listener => doc.subscribe(() => listener()),
        topicId: normalizedTopicId,
      }
      topicRuntimes.set(document, { note: runtime, topicId: normalizedTopicId })
      return document
    },
    checkout: version => doc.checkout([...version]),
    checkoutLatest: () => doc.checkoutToLatest(),
    createFolder: (input) => {
      return inUndoGroup(runtime, () => {
        const parent = resolveParent(runtime, input.parentId)
        assertFolderParent(parent)
        const node = noteTree(doc).createNode(parent?.id, resolveIndex(input.index))
        const entryId = createEntryId()
        node.data.set(ENTRY_ID_KEY, entryId)
        node.data.set(ENTRY_KIND_KEY, 'folder')
        node.data.set(FOLDER_NAME_KEY, assertNonEmpty(input.name, 'Folder name'))
        doc.commit({ origin: 'note:create-folder' })
        return entryId
      })
    },
    createTopic: (input) => {
      return inUndoGroup(runtime, () => {
        const parent = resolveParent(runtime, input.parentId)
        const entryId = createTopicNode(doc, input, parent)
        doc.commit({ origin: 'note:create-topic' })
        return entryId
      })
    },
    deleteEntry: (input) => {
      inUndoGroup(runtime, () => {
        const node = entryNode(runtime, input.entryId)
        const parent = node.parent()
        const index = node.index()
        if (index === undefined)
          throw new Error(`NoteEntry ${input.entryId} does not have a tree position`)

        if (input.strategy === 'promote-children') {
          const children = node.children() ?? []
          children.forEach((child, offset) => child.move(parent, index + offset))
          noteTree(doc).delete(node.id)
        }
        else if (input.strategy === 'delete-subtree') {
          const remove = (current: typeof node): void => {
            current.children()?.forEach(remove)
            noteTree(doc).delete(current.id)
          }
          remove(node)
        }
        else {
          throw new TypeError(`Unknown NoteEntry deletion strategy: ${String(input.strategy)}`)
        }
        doc.commit({ origin: 'note:delete-entry' })
      })
    },
    exportSnapshot: () => new Uint8Array(doc.export({ mode: 'snapshot' })),
    exportUpdates: from => new Uint8Array(doc.export(from === undefined
      ? { mode: 'update' }
      : { mode: 'update', from: doc.frontiersToVV([...from]) })),
    getEntries: () => projectEditorNote(runtime, false).entries,
    getTopicContent: (topicId) => {
      const normalizedTopicId = assertNonEmpty(topicId, 'Topic id')
      const node = entryNode(runtime, normalizedTopicId)
      const blockTree = topicBlockTree(runtime, node)
      return projectTopicContent(
        blockTree,
        normalizedTopicId,
        readTopicTitle(node.data, `Topic ${normalizedTopicId} title`),
      )
    },
    getTitle: () => readNoteTitle(doc),
    getVersion: () => doc.frontiers().map(({ counter, peer }) => ({ counter, peer })),
    importUpdates: (updates) => {
      validateBinary(updates, 'Note updates')
      const roots = new Set<string>()
      const unsubscribe = doc.subscribe((batch) => {
        for (const event of batch.events) {
          const path = doc.getPathToContainer(event.target) ?? []
          const root = mutationRoot(event.path, path)
          if (root)
            roots.add(root)
        }
      })
      doc.import(updates)
      unsubscribe()
      return {
        entriesChanged: roots.has(NOTE_ENTRIES_KEY),
        metadataChanged: roots.has(NOTE_META_KEY),
        topicIds: [...roots]
          .filter(root => root.startsWith('topic:') && root.endsWith(':blocks'))
          .map(root => root.slice('topic:'.length, -':blocks'.length)),
      }
    },
    isTimeTraveling: () => doc.isDetached(),
    moveEntry: (input) => {
      inUndoGroup(runtime, () => {
        const node = entryNode(runtime, input.entryId)
        const parent = resolveParent(runtime, input.parentId)
        if (node.data.get(ENTRY_KIND_KEY) === 'folder')
          assertFolderParent(parent)
        noteTree(doc).move(node.id, parent?.id, resolveIndex(input.index))
        doc.commit({ origin: 'note:move-entry' })
      })
    },
    renameEntry: (entryId, label) => {
      inUndoGroup(runtime, () => {
        const node = entryNode(runtime, entryId)
        const kind = node.data.get(ENTRY_KIND_KEY)
        if (kind === 'folder')
          node.data.set(FOLDER_NAME_KEY, assertNonEmpty(label, 'Folder name'))
        else if (kind === 'topic')
          node.data.set(TOPIC_TITLE_KEY, normalizeTopicTitle(label))
        else
          throw new Error(`NoteEntry ${entryId} has unknown kind: ${String(kind)}`)
        doc.commit({ origin: 'note:rename-entry' })
      })
    },
    renameNote: (title) => {
      inUndoGroup(runtime, () => {
        doc.getMap(NOTE_META_KEY).set('title', assertNonEmpty(title, 'Note title'))
        doc.commit({ origin: 'note:rename' })
      })
    },
    subscribe: (listener) => {
      runtime.listeners.add(listener)
      return () => runtime.listeners.delete(listener)
    },
  }

  runtime = { doc, listeners: new Set(), note }
  noteRuntimes.set(note, runtime)

  if (options.snapshot === null || options.snapshot === undefined) {
    if ((options.updates?.length ?? 0) > 0) {
      validateRestoredNote(doc, id)
    }
    else {
      initializeNote(
        doc,
        id,
        assertNonEmpty(options.title ?? 'Untitled', 'Note title'),
        options.initialTopicHeading,
      )
    }
  }
  else {
    validateRestoredNote(doc, id)
  }

  runtime.undoManager = new UndoManager(doc, { excludeOriginPrefixes: ['sys:', 'ui:'] })
  doc.subscribeLocalUpdates(update => emitChange(runtime, update))
  return note
}

export function resolveEditorTopicBinding(document: EditorTopicDocument): EditorTopicBinding {
  const binding = topicRuntimes.get(document)
  if (!binding)
    throw new TypeError('Expected a Topic document created by EditorNote.getTopic')
  const node = entryNode(binding.note, binding.topicId)
  const blockTree = topicBlockTree(binding.note, node)
  const undoManager = binding.note.undoManager
  if (!undoManager)
    throw new Error('EditorNote UndoManager is not initialized')
  return {
    doc: binding.note.doc,
    tree: blockTree,
    topicId: binding.topicId,
    undoManager,
  }
}
