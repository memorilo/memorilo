import type { BookFileBinding } from '@memorilo/reading-model'
import type { LoroDoc } from 'loro-crdt'
import type { NodeJSON } from 'prosekit/core'
import type { EditorModeValue } from '../common/editor-mode'
import type { CardTopicSource } from './editor-note'
import type { TopicReaderReference } from './topic-reader-reference'
import { initializeLoroTreeFromJson } from '@memorilo/loro-prosemirror-tree/document'
import { Effect } from 'effect'
import { assertEditorMode, EditorMode } from '../common/editor-mode'
import { normalizeOutlineDocument } from '../common/outline-document'
import { validateLoroTopic } from '../schema/topic-schema'
import {
  BOOK_ANNOTATIONS_KEY,
  BOOK_BINDING_KEY,
  BOOK_READING_STATE_KEY,
  ENTRY_ID_KEY,
  ENTRY_KIND_KEY,
  noteTree,
  TOPIC_BLOCK_TREE_KEY,
  TOPIC_CARD_SOURCE_KEY,
  TOPIC_EDITOR_MODE_KEY,
  TOPIC_READER_REFERENCE_KEY,
  TOPIC_TITLE_KEY,
  TOPIC_TYPE_KEY,
  validateBookBindingValue,
} from './editor-note-crdt'
import {
  normalizeNonEmptyString,
  normalizeTopicTitle,
  resolveNoteEntryIndex,
} from './editor-note-validation'
import { normalizeTopicReaderReference } from './topic-reader-reference'

interface TopicNodeInput {
  cardSource?: CardTopicSource
  index?: number
  initialContent?: NodeJSON
  mode: EditorModeValue
  readerReference?: TopicReaderReference
  title: string
}

interface PreparedTopicNode {
  annotationsKey?: string
  blockTreeKey: string
  cardSource?: CardTopicSource
  book?: BookFileBinding
  document: NodeJSON
  entryId: string
  mode: EditorModeValue
  readerReference?: TopicReaderReference
  readingStateKey?: string
  title: string
  topicType: 'book' | 'regular'
}

function emptyTopicDocument(): NodeJSON {
  return { type: 'doc', content: [{ type: 'paragraph' }] }
}

function headingTopicDocument(heading: string): NodeJSON {
  return {
    type: 'doc',
    content: [{
      type: 'heading',
      attrs: { level: 1 },
      content: [{ type: 'text', text: normalizeNonEmptyString(heading, 'Initial Topic heading') }],
    }],
  }
}

function prepareTopicNode(input: TopicNodeInput, bookValue?: BookFileBinding): PreparedTopicNode {
  const entryId = crypto.randomUUID()
  const blockTreeKey = `topic:${entryId}:blocks`
  const document = normalizeOutlineDocument(input.initialContent ?? emptyTopicDocument())
  const mode = assertEditorMode(input.mode, 'Topic Editor mode')
  const topicType = bookValue === undefined ? 'regular' : 'book'
  const title = topicType === 'book'
    ? normalizeNonEmptyString(input.title, 'BookTopic title')
    : normalizeTopicTitle(input.title)

  if (bookValue === undefined) {
    const readerReference = input.readerReference === undefined
      ? undefined
      : normalizeTopicReaderReference(input.readerReference)
    Effect.runSync(validateLoroTopic({
      document,
      entry: {
        blockTreeKey,
        ...(input.cardSource === undefined ? {} : { cardSource: input.cardSource }),
        editorMode: mode,
        entryId,
        kind: 'topic',
        ...(readerReference === undefined ? {} : { readerReference }),
        title,
        topicType,
      },
    }))
    return { blockTreeKey, cardSource: input.cardSource, document, entryId, mode, readerReference, title, topicType }
  }

  if (input.readerReference !== undefined)
    throw new TypeError('BookTopic cannot contain a Reader source reference')

  const book = validateBookBindingValue(bookValue, 'BookTopic binding')
  const annotationsKey = `topic:${entryId}:annotations`
  const readingStateKey = `topic:${entryId}:reading-state`
  Effect.runSync(validateLoroTopic({
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
  }))
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

/** Validates, creates, and initializes every CRDT container owned by a Topic. */
export function createTopicNode(
  doc: LoroDoc,
  input: TopicNodeInput,
  parentNodeId?: Parameters<ReturnType<LoroDoc['getTree']>['createNode']>[0],
  book?: BookFileBinding,
): string {
  const prepared = prepareTopicNode(input, book)
  const node = noteTree(doc).createNode(parentNodeId, resolveNoteEntryIndex(input.index))
  node.data.set(ENTRY_ID_KEY, prepared.entryId)
  node.data.set(ENTRY_KIND_KEY, 'topic')
  node.data.set(TOPIC_TYPE_KEY, prepared.topicType)
  node.data.set(TOPIC_TITLE_KEY, prepared.title)
  node.data.set(TOPIC_EDITOR_MODE_KEY, prepared.mode)
  if (prepared.cardSource !== undefined)
    node.data.set(TOPIC_CARD_SOURCE_KEY, prepared.cardSource)
  if (prepared.readerReference !== undefined)
    node.data.set(TOPIC_READER_REFERENCE_KEY, prepared.readerReference)
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

export function createInitialTopicNode(doc: LoroDoc, heading?: string): string {
  return createTopicNode(doc, {
    ...(heading === undefined ? {} : { initialContent: headingTopicDocument(heading) }),
    mode: EditorMode.Document,
    title: '',
  })
}
