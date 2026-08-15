import type {
  BookFileBinding,
  BookReadingState,
  ReadingAnnotation,
  ReadingPosition,
} from '@memorilo/reading-model'
import type { LoroDoc, LoroMap } from 'loro-crdt'
import type { ImageOcclusionSourceReference } from '../image-occlusion/image-occlusion-model'
import type {
  ApplyTopicBlockEditsInput,
  EditorBookTopicDocument,
  EditorEmbeddedDocument,
  EditorImageOcclusionTopicDocument,
  EditorTopicBinding,
  EditorTopicDocument,
  EditorWhiteboardTopicDocument,
  TopicValidationInput,
} from './editor-note'
import type { EditorNoteDocument, EditorNoteRuntime } from './editor-note-runtime'
import type { TopicContentProjection } from './topic-projection'
import {
  createNodeJsonFromLoroTree,
  updateLoroTreeFromPmState,
} from '@memorilo/loro-prosemirror-tree/document'
import { sameBookFile } from '@memorilo/reading-model'
import { Effect as EffectRuntime } from 'effect'
import { EditorState } from 'prosekit/pm/state'
import { assertEditorMode } from '../common/editor-mode'
import { topicProseMirrorSchema } from '../schema/topic-prosemirror-schema'
import { validateLoroTopic } from '../schema/topic-schema'
import { applyTopicBlockEdits } from './editor-note-block-edits'
import {
  BOOK_ANNOTATIONS_KEY,
  BOOK_BINDING_KEY,
  BOOK_READING_STATE_KEY,
  ENTRY_ID_KEY,
  ENTRY_KIND_KEY,
  findNoteEntry,
  noteTree,
  readBookBinding,
  readString,
  readTopicTitle,
  readTopicType,
  TOPIC_BLOCK_TREE_KEY,
  TOPIC_EDITOR_MODE_KEY,
  TOPIC_TYPE_KEY,
  validateBookBindingValue,
} from './editor-note-crdt'
import {
  findImageOcclusionTopicId,
  getImageOcclusionState,
  projectImageOcclusionContent,
  readImageOcclusionValidationInput,
  setImageOcclusionState,
} from './editor-note-image-occlusion'
import { projectTopicContentFromTree } from './editor-note-projection'
import { readerAnnotationTopicBindings } from './editor-note-reader-bindings'
import { normalizeNonEmptyString } from './editor-note-validation'
import {
  createWhiteboardEmbeddedEditor,
  deleteWhiteboardEmbeddedEditor,
  duplicateWhiteboardEmbeddedEditor,
  getWhiteboardEmbeddedEditorMode,
  getWhiteboardEmbeddedEditors,
  getWhiteboardScene,
  projectWhiteboardContent,
  readWhiteboardValidationInput,
  setWhiteboardEmbeddedEditorMode,
  setWhiteboardScene,
  whiteboardEmbeddedEditorTree,
} from './editor-note-whiteboard'

interface EditorTopicDocumentRuntime extends EditorNoteDocument {
  documentId: string
  editorId?: string
  topicId: string
}

const topicRuntimes = new WeakMap<EditorTopicDocument, EditorTopicDocumentRuntime>()
type NoteEntryNode = ReturnType<ReturnType<LoroDoc['getTree']>['getNodes']>[number]

export function topicBlockTree(runtime: EditorNoteDocument, node: NoteEntryNode) {
  const kind = node.data.get(ENTRY_KIND_KEY)
  if (kind !== 'topic')
    throw new TypeError(`NoteEntry ${readString(node.data, ENTRY_ID_KEY, 'NoteEntry id')} is not a Topic`)
  const blockTreeKey = readString(node.data, TOPIC_BLOCK_TREE_KEY, 'Topic Block tree key')
  return runtime.doc.getTree(blockTreeKey)
}

function bookTopicContainers(runtime: EditorNoteDocument, node: NoteEntryNode) {
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

function readBookReadingState(runtime: EditorNoteDocument, node: NoteEntryNode): BookReadingState {
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

export function readTopicValidationInput(runtime: EditorNoteDocument, topicId: string): TopicValidationInput {
  const node = findTopicNode(runtime, topicId)
  const topicType = readTopicType(node.data, `Topic ${topicId} type`)
  if (topicType === 'image-occlusion')
    return readImageOcclusionValidationInput(runtime, topicId)
  if (topicType === 'whiteboard')
    return readWhiteboardValidationInput(runtime, topicId)
  const blockTree = topicBlockTree(runtime, node)
  const document = createNodeJsonFromLoroTree(blockTree)
  if (!document)
    throw new Error(`Topic ${topicId} does not contain an initialized document`)
  const base: TopicValidationInput = { document, entry: node.data.toJSON() }
  if (topicType === 'regular')
    return base
  const containers = bookTopicContainers(runtime, node)
  return {
    ...base,
    annotations: containers.annotations.toJSON(),
    readingState: containers.readingState.toJSON(),
  }
}

function findTopicNode(runtime: EditorNoteDocument, topicId: string) {
  const node = findNoteEntry(runtime.doc, topicId)
  if (node.data.get(ENTRY_KIND_KEY) !== 'topic')
    throw new TypeError(`NoteEntry ${topicId} is not a Topic`)
  return node
}

export function validateTopicInput(input: TopicValidationInput) {
  return EffectRuntime.runSync(validateLoroTopic(input))
}

export function assertBookFileAvailable(
  runtime: EditorNoteDocument,
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

function createTopicDocument(runtime: EditorNoteDocument, topicId: string): EditorTopicDocument {
  const normalizedTopicId = topicId.trim()
  const node = findTopicNode(runtime, normalizedTopicId)
  const topicType = readTopicType(node.data, `Topic ${normalizedTopicId} type`)
  if (topicType === 'image-occlusion')
    throw new TypeError(`ImageOcclusionTopic ${normalizedTopicId} does not have a ProseMirror document`)
  if (topicType === 'whiteboard')
    throw new TypeError(`WhiteboardTopic ${normalizedTopicId} does not have a single Topic document`)
  topicBlockTree(runtime, node)
  assertEditorMode(node.data.get(TOPIC_EDITOR_MODE_KEY), `Topic ${normalizedTopicId} Editor mode`)
  const document: EditorTopicDocument = {
    documentId: normalizedTopicId,
    getMode: () => {
      const boundNode = findTopicNode(runtime, normalizedTopicId)
      return assertEditorMode(boundNode.data.get(TOPIC_EDITOR_MODE_KEY), `Topic ${normalizedTopicId} Editor mode`)
    },
    noteId: runtime.noteId,
    setMode: (mode) => {
      const normalizedMode = assertEditorMode(mode, `Topic ${normalizedTopicId} Editor mode`)
      const boundNode = findTopicNode(runtime, normalizedTopicId)
      if (boundNode.data.get(TOPIC_EDITOR_MODE_KEY) === normalizedMode)
        return
      boundNode.data.set(TOPIC_EDITOR_MODE_KEY, normalizedMode)
      runtime.doc.commit({ origin: 'ui:set-topic-editor-mode' })
    },
    subscribe: listener => runtime.doc.subscribe(() => listener()),
    topicId: normalizedTopicId,
  }
  topicRuntimes.set(document, { ...runtime, documentId: normalizedTopicId, topicId: normalizedTopicId })
  return document
}

function createEmbeddedTopicDocument(
  runtime: EditorNoteDocument,
  topicId: string,
  editorId: string,
): EditorEmbeddedDocument {
  const normalizedTopicId = normalizeNonEmptyString(topicId, 'WhiteboardTopic id')
  const normalizedEditorId = normalizeNonEmptyString(editorId, 'Embedded Editor id')
  whiteboardEmbeddedEditorTree(runtime, normalizedTopicId, normalizedEditorId)
  const document: EditorEmbeddedDocument = {
    documentId: normalizedEditorId,
    editorId: normalizedEditorId,
    getMode: () => getWhiteboardEmbeddedEditorMode(runtime, normalizedTopicId, normalizedEditorId),
    noteId: runtime.noteId,
    setMode: mode => setWhiteboardEmbeddedEditorMode(runtime, normalizedTopicId, normalizedEditorId, mode),
    subscribe: listener => runtime.doc.subscribe(() => listener()),
    topicId: normalizedTopicId,
  }
  topicRuntimes.set(document, {
    ...runtime,
    documentId: normalizedEditorId,
    editorId: normalizedEditorId,
    topicId: normalizedTopicId,
  })
  return document
}

function createBookTopicDocument(runtime: EditorNoteDocument, topicId: string): EditorBookTopicDocument {
  const normalizedTopicId = topicId.trim()
  const node = findTopicNode(runtime, normalizedTopicId)
  bookTopicContainers(runtime, node)
  const topic = createTopicDocument(runtime, normalizedTopicId)
  const document: EditorBookTopicDocument = {
    ...topic,
    getBook: () => {
      const boundNode = findTopicNode(runtime, normalizedTopicId)
      bookTopicContainers(runtime, boundNode)
      return readBookBinding(boundNode.data, `BookTopic ${normalizedTopicId} binding`)
    },
    getReadingState: () => {
      const boundNode = findTopicNode(runtime, normalizedTopicId)
      validateTopicInput(readTopicValidationInput(runtime, normalizedTopicId))
      return readBookReadingState(runtime, boundNode)
    },
    rebind: (bookValue) => {
      const book = validateBookBindingValue(bookValue, `BookTopic ${normalizedTopicId} binding`)
      const boundNode = findTopicNode(runtime, normalizedTopicId)
      bookTopicContainers(runtime, boundNode)
      const current = readBookBinding(boundNode.data, `BookTopic ${normalizedTopicId} binding`)
      if (book.file.format !== current.file.format)
        throw new TypeError(`BookTopic ${normalizedTopicId} cannot change format from ${current.file.format} to ${book.file.format}`)
      assertBookFileAvailable(runtime, book, normalizedTopicId)
      validateTopicInput({ ...readTopicValidationInput(runtime, normalizedTopicId), entry: { ...boundNode.data.toJSON(), book } })
      boundNode.data.set(BOOK_BINDING_KEY, book)
      runtime.doc.commit({ origin: 'reader:rebind-book-topic' })
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
      const boundTopic = readerAnnotationTopicBindings(runtime.doc, normalizedTopicId)
        .find(binding => !annotations.has(binding.reference.annotationId))
      if (boundTopic) {
        throw new TypeError(
          `BookTopic ${normalizedTopicId} cannot remove Reader annotation ${boundTopic.reference.annotationId} while Topic ${boundTopic.topicId} remains bound`,
        )
      }
      const boundNode = findTopicNode(runtime, normalizedTopicId)
      validateTopicInput({ ...readTopicValidationInput(runtime, normalizedTopicId), annotations: Object.fromEntries(annotations) })
      const containers = bookTopicContainers(runtime, boundNode)
      for (const annotationId of Object.keys(containers.annotations.toJSON())) {
        if (!annotations.has(annotationId))
          containers.annotations.delete(annotationId)
      }
      annotations.forEach((annotation, annotationId) => containers.annotations.set(annotationId, annotation))
      runtime.doc.commit({ origin: 'reader:set-book-topic-annotations' })
    },
    setPosition: (positionValue) => {
      if (positionValue === null || typeof positionValue !== 'object')
        throw new TypeError('BookTopic reading position must be an object')
      const position = structuredClone(positionValue)
      validateTopicInput({ ...readTopicValidationInput(runtime, normalizedTopicId), readingState: { position } })
      const boundNode = findTopicNode(runtime, normalizedTopicId)
      const containers = bookTopicContainers(runtime, boundNode)
      containers.readingState.set('position', position)
      runtime.doc.commit({ origin: 'reader:set-book-topic-position' })
    },
  }
  topicRuntimes.set(document, {
    ...runtime,
    documentId: normalizedTopicId,
    topicId: normalizedTopicId,
  })
  return document
}

export class EditorNoteTopics {
  readonly #runtime: EditorNoteRuntime

  constructor(runtime: EditorNoteRuntime) {
    this.#runtime = runtime
  }

  applyBlockEdits(input: ApplyTopicBlockEditsInput): void {
    if (input.edits.length === 0)
      throw new TypeError('Topic Block edits must contain at least one operation')

    this.#runtime.runMutation(() => {
      const validation = readTopicValidationInput(this.#runtime, input.topicId)
      if (!('document' in validation))
        throw new TypeError(`Topic ${input.topicId} does not have a single editable document`)
      const document = applyTopicBlockEdits(validation.document, input.edits)
      const topic = EffectRuntime.runSync(validateLoroTopic({ ...validation, document }))
      if (!('document' in topic))
        throw new TypeError(`Topic ${input.topicId} does not have a single editable document`)
      const node = findNoteEntry(this.#runtime.doc, input.topicId)
      const blockTree = topicBlockTree(this.#runtime, node)
      const state = EditorState.create({
        doc: topicProseMirrorSchema.nodeFromJSON(topic.document),
        schema: topicProseMirrorSchema,
      })
      updateLoroTreeFromPmState(this.#runtime.doc, blockTree, new Map(), state)
    })
  }

  content(topicId: string): TopicContentProjection {
    const normalizedTopicId = normalizeNonEmptyString(topicId, 'Topic id')
    const node = findNoteEntry(this.#runtime.doc, normalizedTopicId)
    const topicType = readTopicType(node.data, `Topic ${normalizedTopicId} type`)
    if (topicType === 'image-occlusion')
      return projectImageOcclusionContent(this.#runtime, normalizedTopicId)
    if (topicType === 'whiteboard')
      return projectWhiteboardContent(this.#runtime, normalizedTopicId)
    return projectTopicContentFromTree(
      topicBlockTree(this.#runtime, node),
      normalizedTopicId,
      readTopicTitle(node.data, `Topic ${normalizedTopicId} title`),
    )
  }

  get(topicId: string): EditorTopicDocument {
    return createTopicDocument(this.#runtime, topicId)
  }

  getBook(topicId: string): EditorBookTopicDocument {
    return createBookTopicDocument(this.#runtime, topicId)
  }

  getImageOcclusion(topicId: string): EditorImageOcclusionTopicDocument {
    const normalizedTopicId = normalizeNonEmptyString(topicId, 'ImageOcclusionTopic id')
    getImageOcclusionState(this.#runtime, normalizedTopicId)
    return {
      getState: () => getImageOcclusionState(this.#runtime, normalizedTopicId),
      noteId: this.#runtime.noteId,
      setState: state => setImageOcclusionState(this.#runtime, normalizedTopicId, state),
      subscribe: listener => this.#runtime.doc.subscribe(() => listener()),
      topicId: normalizedTopicId,
    }
  }

  getWhiteboard(topicId: string): EditorWhiteboardTopicDocument {
    const normalizedTopicId = normalizeNonEmptyString(topicId, 'WhiteboardTopic id')
    readWhiteboardValidationInput(this.#runtime, normalizedTopicId)
    return {
      createEmbeddedEditor: input => createWhiteboardEmbeddedEditor(this.#runtime, normalizedTopicId, input),
      deleteEmbeddedEditor: editorId => deleteWhiteboardEmbeddedEditor(this.#runtime, normalizedTopicId, editorId),
      duplicateEmbeddedEditor: editorId => duplicateWhiteboardEmbeddedEditor(this.#runtime, normalizedTopicId, editorId),
      getEmbeddedEditor: editorId => createEmbeddedTopicDocument(this.#runtime, normalizedTopicId, editorId),
      getEmbeddedEditors: () => getWhiteboardEmbeddedEditors(this.#runtime, normalizedTopicId),
      getScene: () => getWhiteboardScene(this.#runtime, normalizedTopicId),
      noteId: this.#runtime.noteId,
      setScene: scene => setWhiteboardScene(this.#runtime, normalizedTopicId, scene),
      subscribe: listener => this.#runtime.doc.subscribe(() => listener()),
      topicId: normalizedTopicId,
    }
  }

  findImageOcclusion(source: ImageOcclusionSourceReference): EditorImageOcclusionTopicDocument | null {
    const topicId = findImageOcclusionTopicId(this.#runtime, source)
    return topicId ? this.getImageOcclusion(topicId) : null
  }

  validationInput(topicId: string): TopicValidationInput {
    return readTopicValidationInput(this.#runtime, topicId)
  }

  validate(topicId: string) {
    return EffectRuntime.flatMap(
      EffectRuntime.try({
        try: () => readTopicValidationInput(this.#runtime, topicId),
        catch: error => error instanceof Error ? error : new Error(String(error)),
      }),
      validateLoroTopic,
    )
  }
}

export function resolveEditorTopicBinding(document: EditorTopicDocument): EditorTopicBinding {
  const binding = topicRuntimes.get(document)
  if (!binding)
    throw new TypeError('Expected a Topic document created by EditorNote.getTopic')
  const node = findTopicNode(binding, binding.topicId)
  const tree = binding.editorId === undefined
    ? topicBlockTree(binding, node)
    : whiteboardEmbeddedEditorTree(binding, binding.topicId, binding.editorId)
  if (!binding.undoManager)
    throw new Error('EditorNote UndoManager is not initialized')
  return {
    documentId: binding.documentId,
    doc: binding.doc,
    tree,
    topicId: binding.topicId,
    undoManager: binding.undoManager,
  }
}
