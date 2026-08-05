import type {
  BookFileBinding,
  BookReadingState,
  ReadingAnnotation,
  ReadingPosition,
} from '@memorilo/reading-model'
import type { Effect } from 'effect'
import type { LoroMap, UndoManager as LoroUndoManager } from 'loro-crdt'
import type { NodeJSON } from 'prosekit/core'
import type { EditorModeValue } from '../common/editor-mode'
import type { LoroTopic } from '../schema/topic-schema'
import type { TopicBlockProjection } from './topic-projection'
import {
  createNodeJsonFromLoroTree,
  initializeLoroTreeFromJson,
  updateLoroTreeFromPmState,
} from '@memorilo/loro-prosemirror-tree/model'
import { assertReadingFormat } from '@memorilo/reading-format'
import {
  assertBookFileSha256,
  bookFileIdentityKey,
  sameBookFile,
} from '@memorilo/reading-model'
import { Effect as EffectRuntime } from 'effect'
import {
  LoroDoc,
  UndoManager,
} from 'loro-crdt'
import { EditorState } from 'prosekit/pm/state'
import { assertEditorMode, EditorMode } from '../common/editor-mode'
import { normalizeOutlineDocument } from '../common/outline-document'
import { topicProseMirrorSchema } from '../schema/topic-prosemirror-schema'
import { validateLoroTopic } from '../schema/topic-schema'
import { projectTopicBlocks } from './topic-projection'

const NOTE_META_KEY = 'noteMeta'
const NOTE_ENTRIES_KEY = 'entries'
const NOTE_SCHEMA_VERSION = 4
const NOTE_UNDO_BOUNDARY_KEY = 'undoBoundary'
const ENTRY_ID_KEY = 'entryId'
const ENTRY_KIND_KEY = 'kind'
const FOLDER_NAME_KEY = 'name'
const TOPIC_TITLE_KEY = 'title'
const TOPIC_EDITOR_MODE_KEY = 'editorMode'
const TOPIC_BLOCK_TREE_KEY = 'blockTreeKey'
const TOPIC_TYPE_KEY = 'topicType'
const BOOK_BINDING_KEY = 'book'
const BOOK_READING_STATE_KEY = 'readingStateKey'
const BOOK_ANNOTATIONS_KEY = 'annotationsKey'

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

interface TopicSnapshotBase extends NoteEntryBase {
  kind: 'topic'
  mode: EditorModeValue
  /** The effective title: the explicit title, or the first content line when it is empty. */
  title: string
}

export interface RegularTopicSnapshot extends TopicSnapshotBase {
  topicType: 'regular'
}

export interface BookTopicSnapshot extends TopicSnapshotBase {
  book: BookFileBinding
  topicType: 'book'
}

export type TopicSnapshot = BookTopicSnapshot | RegularTopicSnapshot

export type NoteEntrySnapshot = FolderSnapshot | TopicSnapshot

export interface TopicContentProjection {
  blocks: readonly TopicBlockProjection[]
  /** The effective title projected from the Topic's explicit title and content. */
  title: string
  topicId: string
}

export type TopicBlockEdit
  = | {
    attributes?: Readonly<Record<string, unknown>>
    blockId?: string
    content: readonly NodeJSON[]
    index?: number
    kind: string
    operation: 'insert-block'
    parentId?: string | null
  }
  | {
    blockId: string
    content: readonly NodeJSON[]
    operation: 'update-block-content'
  }
  | {
    attributes: Readonly<Record<string, unknown>>
    blockId: string
    operation: 'update-block-attributes'
  }
  | {
    blockId: string
    index?: number
    operation: 'move-block'
    parentId?: string | null
  }
  | {
    blockId: string
    operation: 'delete-block'
    strategy: DeleteNoteEntryStrategy
  }

export interface ApplyTopicBlockEditsInput {
  edits: readonly TopicBlockEdit[]
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

export interface CreateBookTopicInput {
  book: BookFileBinding
  /** The zero-based position among the parent's children. Appends when omitted. */
  index?: number
  /** Initial ProseMirror content. A canonical empty document is created when omitted. */
  initialContent?: NodeJSON
  mode: EditorModeValue
  /** The containing Topic or Folder, or `null`/omitted for a root BookTopic. */
  parentId?: string | null
  /** An explicit, non-empty title independent from the publication title. */
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

export interface RegularTopicValidationInput {
  readonly document: NodeJSON
  readonly entry: unknown
}

export interface BookTopicValidationInput extends RegularTopicValidationInput {
  readonly annotations: unknown
  readonly readingState: unknown
}

export type TopicValidationInput = BookTopicValidationInput | RegularTopicValidationInput

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

export interface EditorBookTopicDocument extends EditorTopicDocument {
  /** Returns a detached snapshot of the current concrete file binding. */
  readonly getBook: () => BookFileBinding
  /** Returns a detached snapshot of the current position and annotations. */
  readonly getReadingState: () => BookReadingState
  /** Rebinds to another concrete file of the same format without changing reading state. */
  readonly rebind: (book: BookFileBinding) => void
  /** Reconciles annotations by stable annotation ID. */
  readonly setAnnotations: (annotations: readonly ReadingAnnotation[]) => void
  /** Stores the current format-specific reading position. */
  readonly setPosition: (position: ReadingPosition) => void
}

/**
 * Owns a Note's authoritative in-memory LoroDoc and exposes Note-level editing operations.
 * Topic documents returned by `getTopic` are lightweight handles over this same LoroDoc.
 */
export interface EditorNote {
  readonly id: string
  /** Atomically applies validated structural Block edits to one Topic. */
  applyTopicBlockEdits: (input: ApplyTopicBlockEditsInput) => void
  /** Checks out a historical version and detaches the Note from its editable latest state. */
  checkout: (version: readonly EditorNoteVersion[]) => void
  /** Returns a time-traveling Note to its editable latest state. */
  checkoutLatest: () => void
  /** Creates a Folder and returns its stable entry ID. */
  createFolder: (input: CreateFolderInput) => string
  /** Atomically creates a BookTopic with editable content and initialized reading state. */
  createBookTopic: (input: CreateBookTopicInput) => string
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
  /** Returns the reading handle for an existing BookTopic. */
  getBookTopic: (topicId: string) => EditorBookTopicDocument
  /** Returns the current block projection and effective title for an existing Topic. */
  getTopicContent: (topicId: string) => TopicContentProjection
  /** Returns the exact plain JavaScript object passed to Topic validation. */
  getTopicValidationInput: (topicId: string) => TopicValidationInput
  /** Validates a Topic's Loro entry and referenced content tree as one complete object. */
  validateTopic: (topicId: string) => Effect.Effect<LoroTopic, Error>
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
  /** Creates a BookTopic as the only initial root entry. Only valid for a new Note. */
  initialBookTopic?: Omit<CreateBookTopicInput, 'index' | 'parentId'>
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

function readTopicType(map: LoroMap, description: string): 'book' | 'regular' {
  const value = map.get(TOPIC_TYPE_KEY)
  if (value !== 'book' && value !== 'regular')
    throw new Error(`${description} must be "book" or "regular"`)
  return value
}

function validateBookBindingValue(value: unknown, description: string): BookFileBinding {
  if (value === null || Array.isArray(value) || typeof value !== 'object')
    throw new Error(`${description} must be an object`)
  const binding = structuredClone(value) as BookFileBinding
  if (typeof binding.book?.title !== 'string' || binding.book.title.trim().length === 0)
    throw new Error(`${description} publication title must be a non-empty string`)
  if (!Array.isArray(binding.book.authors) || binding.book.authors.some(author => typeof author !== 'string' || author.trim().length === 0))
    throw new Error(`${description} authors must contain non-empty strings`)
  if (typeof binding.file?.format !== 'string')
    throw new Error(`${description} format must be a string`)
  assertReadingFormat(binding.file.format)
  if (typeof binding.file.sha256 !== 'string')
    throw new Error(`${description} SHA-256 must be a string`)
  assertBookFileSha256(binding.file.sha256)
  if (!Number.isSafeInteger(binding.file.byteLength) || binding.file.byteLength < 1)
    throw new Error(`${description} byte length must be a positive safe integer`)
  if (typeof binding.file.originalName !== 'string' || binding.file.originalName.trim().length === 0)
    throw new Error(`${description} original name must be a non-empty string`)
  if (!Array.isArray(binding.retrievalHints))
    throw new Error(`${description} retrieval hints must be an array`)
  for (const [index, hint] of binding.retrievalHints.entries()) {
    if (hint === null || typeof hint !== 'object' || typeof hint.readingId !== 'string' || hint.readingId.length === 0)
      throw new Error(`${description} retrieval hint ${index} is invalid`)
    if (hint.kind === 'shelf') {
      if (typeof hint.sourceId !== 'string' || hint.sourceId.length === 0
        || typeof hint.publicationId !== 'string' || hint.publicationId.length === 0) {
        throw new Error(`${description} Shelf retrieval hint ${index} is invalid`)
      }
    }
    else if (hint.kind !== 'local') {
      throw new Error(`${description} retrieval hint ${index} has an unknown kind`)
    }
  }
  return binding
}

function readBookBinding(map: LoroMap, description: string): BookFileBinding {
  return validateBookBindingValue(map.get(BOOK_BINDING_KEY), description)
}

function normalizeTopicTitle(value: string): string {
  if (typeof value !== 'string')
    throw new TypeError('Topic title must be a string')
  return value.trim()
}

function normalizeBookTopicTitle(value: string): string {
  return assertNonEmpty(value, 'BookTopic title')
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

function bookTopicContainers(runtime: EditorNoteRuntime, node: ReturnType<typeof entryNode>) {
  const entryId = readString(node.data, ENTRY_ID_KEY, 'BookTopic id')
  if (readTopicType(node.data, `Topic ${entryId} type`) !== 'book')
    throw new TypeError(`Topic ${entryId} is not a BookTopic`)
  const readingStateKey = readString(node.data, BOOK_READING_STATE_KEY, `BookTopic ${entryId} reading state key`)
  const annotationsKey = readString(node.data, BOOK_ANNOTATIONS_KEY, `BookTopic ${entryId} annotations key`)
  return {
    annotations: runtime.doc.getMap(annotationsKey),
    readingState: runtime.doc.getMap(readingStateKey),
  }
}

function annotationRecord(map: LoroMap): Readonly<Record<string, ReadingAnnotation>> {
  return structuredClone(map.toJSON()) as Readonly<Record<string, ReadingAnnotation>>
}

function readBookReadingState(runtime: EditorNoteRuntime, node: ReturnType<typeof entryNode>): BookReadingState {
  const book = readBookBinding(node.data, 'BookTopic binding')
  const containers = bookTopicContainers(runtime, node)
  const position = containers.readingState.get('position')
  if (position !== null && (typeof position !== 'object' || Array.isArray(position)))
    throw new Error('BookTopic reading position must be an object or null')
  if (position !== null && (position as ReadingPosition).format !== book.file.format)
    throw new Error(`BookTopic reading position must use ${book.file.format} format`)
  return {
    annotations: Object.values(annotationRecord(containers.annotations))
      .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id)),
    position: position === null ? null : structuredClone(position) as ReadingPosition,
  }
}

function getTopicValidationInput(runtime: EditorNoteRuntime, topicId: string): TopicValidationInput {
  const normalizedTopicId = assertNonEmpty(topicId, 'Topic id')
  const node = entryNode(runtime, normalizedTopicId)
  const blockTree = topicBlockTree(runtime, node)
  const document = createNodeJsonFromLoroTree(blockTree)
  if (!document)
    throw new Error(`Topic ${normalizedTopicId} does not contain an initialized document`)
  const base: RegularTopicValidationInput = {
    document,
    entry: node.data.toJSON(),
  }
  if (readTopicType(node.data, `Topic ${normalizedTopicId} type`) === 'regular')
    return base
  const containers = bookTopicContainers(runtime, node)
  return {
    ...base,
    annotations: containers.annotations.toJSON(),
    readingState: containers.readingState.toJSON(),
  }
}

function validateTopicInput(input: TopicValidationInput): LoroTopic {
  return EffectRuntime.runSync(validateLoroTopic(input))
}

function assertBookFileAvailable(
  runtime: EditorNoteRuntime,
  book: BookFileBinding,
  excludedTopicId?: string,
): void {
  for (const node of noteTree(runtime.doc).getNodes()) {
    if (node.data.get(ENTRY_KIND_KEY) !== 'topic' || node.data.get(TOPIC_TYPE_KEY) !== 'book')
      continue
    const topicId = readString(node.data, ENTRY_ID_KEY, 'BookTopic id')
    if (topicId === excludedTopicId)
      continue
    if (sameBookFile(readBookBinding(node.data, `BookTopic ${topicId} binding`).file, book.file))
      throw new Error(`Note already contains BookTopic ${topicId} for ${book.file.format}:${book.file.sha256}`)
  }
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

function applyTopicBlockEdits(document: NodeJSON, edits: readonly TopicBlockEdit[]): NodeJSON {
  const next = structuredClone(document)

  const childrenOf = (node: NodeJSON): NodeJSON[] => {
    node.content ??= []
    return node.content
  }
  const blockChildren = (node: NodeJSON): NodeJSON[] => childrenOf(node).filter(child => child.type === 'list')
  const find = (blockId: string): { block: NodeJSON, index: number, siblings: NodeJSON[] } => {
    const visit = (siblings: NodeJSON[]): { block: NodeJSON, index: number, siblings: NodeJSON[] } | undefined => {
      for (const [index, block] of siblings.entries()) {
        if (block.type !== 'list')
          continue
        if (block.attrs?.blockId === blockId)
          return { block, index, siblings }
        const nested = visit(childrenOf(block))
        if (nested)
          return nested
      }
    }
    const result = visit(childrenOf(next))
    if (!result)
      throw new Error(`Unknown Topic Block: ${blockId}`)
    return result
  }
  const destination = (parentId: string | null | undefined): NodeJSON[] => parentId == null
    ? childrenOf(next)
    : childrenOf(find(parentId).block)
  const insertionIndex = (index: number | undefined, siblings: readonly NodeJSON[]): number => {
    const blockIndexes = siblings.flatMap((node, nodeIndex) => node.type === 'list' ? [nodeIndex] : [])
    const blockIndex = index ?? blockIndexes.length
    if (!Number.isSafeInteger(blockIndex) || blockIndex < 0 || blockIndex > blockIndexes.length)
      throw new RangeError(`Topic Block index must be between 0 and ${blockIndexes.length}`)
    return blockIndexes[blockIndex] ?? siblings.length
  }
  const assertBlockBody = (content: readonly NodeJSON[]): void => {
    if (content.some(node => node.type === 'list'))
      throw new TypeError('Topic Block content must not contain direct child Blocks; use structural Block edits instead')
  }
  const hasDescendant = (block: NodeJSON, blockId: string): boolean => blockChildren(block)
    .some(child => child.attrs?.blockId === blockId || hasDescendant(child, blockId))
  const containsBlock = (nodes: readonly NodeJSON[], blockId: string): boolean => nodes
    .some(node => node.attrs?.blockId === blockId || containsBlock(node.content ?? [], blockId))

  for (const edit of edits) {
    switch (edit.operation) {
      case 'insert-block': {
        assertBlockBody(edit.content)
        if (edit.blockId !== undefined && containsBlock(next.content ?? [], edit.blockId))
          throw new TypeError(`Topic Block ${edit.blockId} already exists`)
        const siblings = destination(edit.parentId)
        const blockId = edit.blockId ?? crypto.randomUUID()
        siblings.splice(insertionIndex(edit.index, siblings), 0, {
          attrs: { ...structuredClone(edit.attributes ?? {}), blockId, kind: edit.kind },
          content: structuredClone([...edit.content]),
          type: 'list',
        })
        break
      }
      case 'update-block-content': {
        assertBlockBody(edit.content)
        const { block } = find(edit.blockId)
        block.content = [...structuredClone([...edit.content]), ...blockChildren(block)]
        break
      }
      case 'update-block-attributes': {
        const { block } = find(edit.blockId)
        block.attrs = {
          ...structuredClone(edit.attributes),
          blockId: edit.blockId,
          kind: edit.attributes.kind ?? block.attrs?.kind,
        }
        break
      }
      case 'move-block': {
        const source = find(edit.blockId)
        if (edit.parentId === edit.blockId || (edit.parentId && hasDescendant(source.block, edit.parentId)))
          throw new TypeError(`Topic Block ${edit.blockId} cannot be moved into itself or its descendant`)
        source.siblings.splice(source.index, 1)
        const siblings = destination(edit.parentId)
        siblings.splice(insertionIndex(edit.index, siblings), 0, source.block)
        break
      }
      case 'delete-block': {
        const source = find(edit.blockId)
        if (edit.strategy === 'promote-children')
          source.siblings.splice(source.index, 1, ...blockChildren(source.block))
        else if (edit.strategy === 'delete-subtree')
          source.siblings.splice(source.index, 1)
        else
          throw new TypeError(`Unknown Topic Block deletion strategy: ${String(edit.strategy)}`)
        break
      }
    }
  }
  return next
}

function projectEditorNote(runtime: EditorNoteRuntime, includeTopics = true): {
  entries: readonly NoteEntrySnapshot[]
  topics: readonly TopicContentProjection[]
} {
  const entries: NoteEntrySnapshot[] = []
  const topics: TopicContentProjection[] = []
  const seenEntryIds = new Set<string>()
  const bookTopicIdsByFile = new Map<string, string>()

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
        const topicType = readTopicType(node.meta, `Topic ${id} type`)
        const blockTreeKey = readString(node.meta, TOPIC_BLOCK_TREE_KEY, `Topic ${id} Block tree key`)
        const blockTree = runtime.doc.getTree(blockTreeKey)
        const content = projectTopicContent(blockTree, id, readTopicTitle(node.meta, `Topic ${id} title`))
        const base = {
          id,
          kind,
          mode: assertEditorMode(node.meta.get(TOPIC_EDITOR_MODE_KEY), `Topic ${id} Editor mode`),
          ordinal,
          parentId,
          title: content.title,
        } as const
        if (topicType === 'book') {
          const book = readBookBinding(node.meta, `BookTopic ${id} binding`)
          const identity = bookFileIdentityKey(book.file)
          const existingTopicId = bookTopicIdsByFile.get(identity)
          if (existingTopicId)
            throw new Error(`BookTopics ${existingTopicId} and ${id} bind the same file ${identity}`)
          bookTopicIdsByFile.set(identity, id)
          entries.push({ ...base, book, topicType })
        }
        else {
          entries.push({ ...base, topicType })
        }

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

function topicIdFromMutationRoot(root: string): string | undefined {
  if (!root.startsWith('topic:'))
    return undefined
  for (const suffix of [':annotations', ':blocks', ':reading-state']) {
    if (root.endsWith(suffix))
      return root.slice('topic:'.length, -suffix.length)
  }
  return undefined
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

interface PreparedTopicNode {
  annotationsKey?: string
  blockTreeKey: string
  book?: BookFileBinding
  document: NodeJSON
  entryId: string
  mode: EditorModeValue
  readingStateKey?: string
  title: string
  topicType: 'book' | 'regular'
}

function prepareTopicNode(input: CreateTopicInput, bookValue?: BookFileBinding): PreparedTopicNode {
  const entryId = createEntryId()
  const blockTreeKey = `topic:${entryId}:blocks`
  const document = normalizeOutlineDocument(input.initialContent ?? emptyTopicDocument())
  const mode = assertEditorMode(input.mode, 'Topic Editor mode')
  const topicType = bookValue === undefined ? 'regular' : 'book'
  const title = topicType === 'book'
    ? normalizeBookTopicTitle(input.title)
    : normalizeTopicTitle(input.title)

  if (bookValue === undefined) {
    validateTopicInput({
      document,
      entry: {
        blockTreeKey,
        editorMode: mode,
        entryId,
        kind: 'topic',
        title,
        topicType,
      },
    })
    return { blockTreeKey, document, entryId, mode, title, topicType }
  }

  const book = validateBookBindingValue(bookValue, 'BookTopic binding')
  const annotationsKey = `topic:${entryId}:annotations`
  const readingStateKey = `topic:${entryId}:reading-state`
  validateTopicInput({
    annotations: {},
    document,
    entry: {
      annotationsKey,
      blockTreeKey,
      book,
      editorMode: mode,
      entryId,
      kind: 'topic',
      readingStateKey,
      title,
      topicType,
    },
    readingState: { position: null },
  })
  return {
    annotationsKey,
    blockTreeKey,
    book,
    document,
    entryId,
    mode,
    readingStateKey,
    title,
    topicType,
  }
}

function createTopicNode(
  doc: LoroDoc,
  input: CreateTopicInput,
  parent: ReturnType<typeof entryNode> | undefined,
  book?: BookFileBinding,
): string {
  const prepared = prepareTopicNode(input, book)
  const node = noteTree(doc).createNode(parent?.id, resolveIndex(input.index))
  node.data.set(ENTRY_ID_KEY, prepared.entryId)
  node.data.set(ENTRY_KIND_KEY, 'topic')
  node.data.set(TOPIC_TYPE_KEY, prepared.topicType)
  node.data.set(TOPIC_TITLE_KEY, prepared.title)
  node.data.set(TOPIC_EDITOR_MODE_KEY, prepared.mode)
  const blockTree = doc.getTree(prepared.blockTreeKey)
  node.data.set(TOPIC_BLOCK_TREE_KEY, prepared.blockTreeKey)
  if (prepared.book !== undefined) {
    if (!prepared.readingStateKey || !prepared.annotationsKey)
      throw new Error('Prepared BookTopic is missing its Loro container keys')
    node.data.set(BOOK_BINDING_KEY, prepared.book)
    node.data.set(BOOK_READING_STATE_KEY, prepared.readingStateKey)
    node.data.set(BOOK_ANNOTATIONS_KEY, prepared.annotationsKey)
    doc.getMap(prepared.readingStateKey).set('position', null)
    doc.getMap(prepared.annotationsKey)
  }
  initializeLoroTreeFromJson(blockTree, prepared.document)
  return prepared.entryId
}

function initializeNote(
  doc: LoroDoc,
  id: string,
  title: string,
  initialTopicHeading?: string,
  initialBookTopic?: Omit<CreateBookTopicInput, 'index' | 'parentId'>,
): void {
  const meta = doc.getMap(NOTE_META_KEY)
  meta.set('id', id)
  meta.set('schemaVersion', NOTE_SCHEMA_VERSION)
  meta.set('title', title)
  if (initialBookTopic !== undefined) {
    createTopicNode(doc, initialBookTopic, undefined, initialBookTopic.book)
  }
  else {
    createTopicNode(doc, {
      ...(initialTopicHeading === undefined ? {} : { initialContent: headingTopicDocument(initialTopicHeading) }),
      mode: EditorMode.Document,
      title: '',
    }, undefined)
  }
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
  const runtime: EditorNoteRuntime = {
    doc,
    listeners: new Set(),
    note: { id: expectedId } as EditorNote,
  }
  const projection = projectEditorNote(runtime)
  projection.entries.forEach((entry) => {
    if (entry.kind === 'topic')
      validateTopicInput(getTopicValidationInput(runtime, entry.id))
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
  if (restoring && options.initialBookTopic !== undefined)
    throw new TypeError('Initial BookTopic is only valid when creating a new Note')
  if (options.initialTopicHeading !== undefined && options.initialBookTopic !== undefined)
    throw new TypeError('A new Note cannot initialize both a regular Topic and a BookTopic')
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
    applyTopicBlockEdits: (input) => {
      if (input.edits.length === 0)
        throw new TypeError('Topic Block edits must contain at least one operation')
      inUndoGroup(runtime, () => {
        const validation = getTopicValidationInput(runtime, input.topicId)
        const document = applyTopicBlockEdits(validation.document, input.edits)
        const topic = EffectRuntime.runSync(validateLoroTopic({ ...validation, document }))
        const node = entryNode(runtime, input.topicId)
        const blockTree = topicBlockTree(runtime, node)
        const state = EditorState.create({
          doc: topicProseMirrorSchema.nodeFromJSON(topic.document),
          schema: topicProseMirrorSchema,
        })
        updateLoroTreeFromPmState(doc, blockTree, new Map(), state)
      })
    },
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
    getBookTopic: (topicId) => {
      const normalizedTopicId = assertNonEmpty(topicId, 'BookTopic id')
      const node = entryNode(runtime, normalizedTopicId)
      bookTopicContainers(runtime, node)
      const topic = note.getTopic(normalizedTopicId)
      const document: EditorBookTopicDocument = {
        ...topic,
        getBook: () => {
          const boundNode = entryNode(runtime, normalizedTopicId)
          bookTopicContainers(runtime, boundNode)
          return readBookBinding(boundNode.data, `BookTopic ${normalizedTopicId} binding`)
        },
        getReadingState: () => {
          const boundNode = entryNode(runtime, normalizedTopicId)
          validateTopicInput(getTopicValidationInput(runtime, normalizedTopicId))
          return readBookReadingState(runtime, boundNode)
        },
        rebind: (bookValue) => {
          const book = validateBookBindingValue(bookValue, `BookTopic ${normalizedTopicId} binding`)
          const boundNode = entryNode(runtime, normalizedTopicId)
          bookTopicContainers(runtime, boundNode)
          const current = readBookBinding(boundNode.data, `BookTopic ${normalizedTopicId} binding`)
          if (book.file.format !== current.file.format) {
            throw new TypeError(
              `BookTopic ${normalizedTopicId} cannot change format from ${current.file.format} to ${book.file.format}`,
            )
          }
          assertBookFileAvailable(runtime, book, normalizedTopicId)
          validateTopicInput({
            ...getTopicValidationInput(runtime, normalizedTopicId),
            entry: { ...boundNode.data.toJSON(), book },
          })
          boundNode.data.set(BOOK_BINDING_KEY, book)
          doc.commit({ origin: 'reader:rebind-book-topic' })
        },
        setAnnotations: (annotationValues) => {
          if (!Array.isArray(annotationValues))
            throw new TypeError('BookTopic annotations must be an array')
          const annotations = new Map<string, ReadingAnnotation>()
          for (const value of annotationValues) {
            if (value === null || typeof value !== 'object')
              throw new TypeError('BookTopic annotation must be an object')
            const annotation = structuredClone(value) as ReadingAnnotation
            if (typeof annotation.id !== 'string' || annotation.id.length === 0)
              throw new TypeError('BookTopic annotation id must be a non-empty string')
            if (annotations.has(annotation.id))
              throw new TypeError(`Duplicate BookTopic annotation id: ${annotation.id}`)
            annotations.set(annotation.id, annotation)
          }
          const record = Object.fromEntries(annotations)
          validateTopicInput({
            ...getTopicValidationInput(runtime, normalizedTopicId),
            annotations: record,
          })
          const boundNode = entryNode(runtime, normalizedTopicId)
          const containers = bookTopicContainers(runtime, boundNode)
          for (const annotationId of Object.keys(containers.annotations.toJSON())) {
            if (!annotations.has(annotationId))
              containers.annotations.delete(annotationId)
          }
          annotations.forEach((annotation, annotationId) => {
            containers.annotations.set(annotationId, annotation)
          })
          doc.commit({ origin: 'reader:set-book-topic-annotations' })
        },
        setPosition: (positionValue) => {
          if (positionValue === null || typeof positionValue !== 'object')
            throw new TypeError('BookTopic reading position must be an object')
          const position = structuredClone(positionValue)
          validateTopicInput({
            ...getTopicValidationInput(runtime, normalizedTopicId),
            readingState: { position },
          })
          const boundNode = entryNode(runtime, normalizedTopicId)
          const containers = bookTopicContainers(runtime, boundNode)
          containers.readingState.set('position', position)
          doc.commit({ origin: 'reader:set-book-topic-position' })
        },
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
    createBookTopic: (input) => {
      const book = validateBookBindingValue(input.book, 'BookTopic binding')
      assertBookFileAvailable(runtime, book)
      return inUndoGroup(runtime, () => {
        const parent = resolveParent(runtime, input.parentId)
        assertBookFileAvailable(runtime, book)
        const entryId = createTopicNode(doc, input, parent, book)
        doc.commit({ origin: 'note:create-book-topic' })
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
    getTopicValidationInput: topicId => getTopicValidationInput(runtime, topicId),
    validateTopic: (topicId) => {
      return EffectRuntime.flatMap(
        EffectRuntime.try({
          try: () => getTopicValidationInput(runtime, topicId),
          catch: error => error instanceof Error ? error : new Error(String(error)),
        }),
        validateLoroTopic,
      )
    },
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
        topicIds: [...new Set([...roots].flatMap((root) => {
          const topicId = topicIdFromMutationRoot(root)
          return topicId === undefined ? [] : [topicId]
        }))],
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
        if (kind === 'folder') {
          node.data.set(FOLDER_NAME_KEY, assertNonEmpty(label, 'Folder name'))
        }
        else if (kind === 'topic') {
          node.data.set(TOPIC_TITLE_KEY, readTopicType(node.data, `Topic ${entryId} type`) === 'book'
            ? normalizeBookTopicTitle(label)
            : normalizeTopicTitle(label))
        }
        else {
          throw new Error(`NoteEntry ${entryId} has unknown kind: ${String(kind)}`)
        }
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
        options.initialBookTopic,
      )
    }
  }
  else {
    validateRestoredNote(doc, id)
  }

  runtime.undoManager = new UndoManager(doc, { excludeOriginPrefixes: ['reader:', 'sys:', 'ui:'] })
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
