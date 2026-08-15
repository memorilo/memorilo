import type { ReadingAnnotation } from '@memorilo/reading-model'
import type { LoroDoc } from 'loro-crdt'
import type { EditorNoteDocument } from './editor-note-runtime'
import type { TopicReaderReference } from './topic-reader-reference'
import {
  BOOK_ANNOTATIONS_KEY,
  ENTRY_ID_KEY,
  ENTRY_KIND_KEY,
  findNoteEntry,
  noteTree,
  readString,
  readTopicReaderReference,
  readTopicType,
} from './editor-note-crdt'
import { isLinkedTopicReaderReference } from './topic-reader-reference'

type LinkedTopicReaderReference = Extract<
  TopicReaderReference,
  { annotationId: string, bookTopicId: string }
>

export interface ReaderAnnotationTopicBinding {
  reference: LinkedTopicReaderReference
  topicId: string
}

export function readerAnnotationBindingKey(reference: LinkedTopicReaderReference): string {
  return JSON.stringify([reference.bookTopicId, reference.annotationId])
}

export function assertLinkedReaderAnnotationExists(
  runtime: EditorNoteDocument,
  topicId: string,
  reference: LinkedTopicReaderReference,
): void {
  const sourceTopic = findNoteEntry(runtime.doc, reference.bookTopicId)
  if (readTopicType(sourceTopic.data, `BookTopic ${reference.bookTopicId} type`) !== 'book') {
    throw new TypeError(
      `Reader-bound Topic ${topicId} source ${reference.bookTopicId} must be a BookTopic`,
    )
  }
  const annotationsKey = readString(
    sourceTopic.data,
    BOOK_ANNOTATIONS_KEY,
    `BookTopic ${reference.bookTopicId} annotations key`,
  )
  const value = runtime.doc.getMap(annotationsKey).get(reference.annotationId)
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(
      `BookTopic ${reference.bookTopicId} does not contain Reader annotation ${reference.annotationId}`,
    )
  }
  const annotation = structuredClone(value) as ReadingAnnotation
  if (annotation.id !== reference.annotationId) {
    throw new Error(
      `BookTopic ${reference.bookTopicId} Reader annotation ${reference.annotationId} has mismatched identity`,
    )
  }
}

export function findReaderAnnotationTopicId(
  doc: LoroDoc,
  reference: LinkedTopicReaderReference,
  excludedTopicId?: string,
): string | null {
  const referenceKey = readerAnnotationBindingKey(reference)
  let match: string | null = null
  for (const binding of readerAnnotationTopicBindings(doc, reference.bookTopicId)) {
    if (binding.topicId === excludedTopicId
      || readerAnnotationBindingKey(binding.reference) !== referenceKey) {
      continue
    }
    if (match) {
      throw new Error(
        `Topics ${match} and ${binding.topicId} both bind Reader annotation ${reference.annotationId}`,
      )
    }
    match = binding.topicId
  }
  return match
}

export function readerAnnotationTopicBindings(
  doc: LoroDoc,
  bookTopicId?: string,
): readonly ReaderAnnotationTopicBinding[] {
  const bindings: ReaderAnnotationTopicBinding[] = []
  const visit = (nodes: ReturnType<ReturnType<typeof noteTree>['toArray']>): void => {
    for (const node of nodes) {
      if (node.meta.get(ENTRY_KIND_KEY) === 'topic'
        && readTopicType(node.meta, 'Topic type') === 'regular') {
        const topicId = readString(node.meta, ENTRY_ID_KEY, 'Topic id')
        const existingReference = readTopicReaderReference(node.meta)
        if (existingReference !== null
          && isLinkedTopicReaderReference(existingReference)
          && (bookTopicId === undefined || existingReference.bookTopicId === bookTopicId)) {
          bindings.push({ reference: existingReference, topicId })
        }
      }
      visit(node.children)
    }
  }
  visit(noteTree(doc).toArray())
  return bindings
}
