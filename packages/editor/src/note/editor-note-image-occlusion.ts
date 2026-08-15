import type { ReadingAnnotation } from '@memorilo/reading-model'
import type { LoroDoc } from 'loro-crdt'
import type { NodeJSON } from 'prosekit/core'
import type {
  ImageOcclusionSource,
  ImageOcclusionSourceReference,
  ImageOcclusionState,
} from '../image-occlusion/image-occlusion-model'
import type {
  CreateImageOcclusionTopicInput,
  ImageOcclusionTopicValidationInput,
} from './editor-note'
import type { EditorNoteDocument } from './editor-note-runtime'
import type { TopicContentProjection } from './topic-projection'
import { createNodeJsonFromLoroTree } from '@memorilo/loro-prosemirror-tree/document'
import { Effect } from 'effect'
import { LoroMap } from 'loro-crdt'
import {
  imageOcclusionSourceKey,
} from '../image-occlusion/image-occlusion-model'
import { validateLoroTopic } from '../schema/topic-schema'
import {
  BOOK_ANNOTATIONS_KEY,
  ENTRY_ID_KEY,
  ENTRY_KIND_KEY,
  findNoteEntry,
  IMAGE_OCCLUSION_STATE_KEY,
  noteTree,
  readString,
  readTopicTitle,
  readTopicType,
  TOPIC_BLOCK_TREE_KEY,
  TOPIC_TITLE_KEY,
  TOPIC_TYPE_KEY,
} from './editor-note-crdt'
import { normalizeNonEmptyString, normalizeTopicTitle, resolveNoteEntryIndex } from './editor-note-validation'

type NoteEntryNode = ReturnType<ReturnType<LoroDoc['getTree']>['getNodes']>[number]

function imageOcclusionNode(runtime: EditorNoteDocument, topicId: string): NoteEntryNode {
  const normalizedTopicId = normalizeNonEmptyString(topicId, 'ImageOcclusionTopic id')
  const node = findNoteEntry(runtime.doc, normalizedTopicId)
  if (readTopicType(node.data, `Topic ${normalizedTopicId} type`) !== 'image-occlusion')
    throw new TypeError(`Topic ${normalizedTopicId} is not an ImageOcclusionTopic`)
  return node
}

function imageOcclusionStateMap(node: NoteEntryNode): LoroMap {
  const value = node.data.get(IMAGE_OCCLUSION_STATE_KEY)
  if (!(value instanceof LoroMap)) {
    const topicId = readString(node.data, ENTRY_ID_KEY, 'ImageOcclusionTopic id')
    throw new Error(`ImageOcclusionTopic ${topicId} state must be a LoroMap`)
  }
  return value
}

function imageOcclusionEntryValue(node: NoteEntryNode): Record<string, unknown> {
  return {
    entryId: readString(node.data, ENTRY_ID_KEY, 'ImageOcclusionTopic id'),
    kind: node.data.get(ENTRY_KIND_KEY),
    title: readTopicTitle(node.data, 'ImageOcclusionTopic title'),
    topicType: node.data.get(TOPIC_TYPE_KEY),
  }
}

export function readImageOcclusionValidationInput(
  runtime: EditorNoteDocument,
  topicId: string,
): ImageOcclusionTopicValidationInput {
  const node = imageOcclusionNode(runtime, topicId)
  return {
    entry: imageOcclusionEntryValue(node),
    state: imageOcclusionStateMap(node).toJSON(),
  }
}

function sourceImage(document: NodeJSON, imageId: string): NodeJSON | null {
  if (document.type === 'image' && document.attrs?.imageId === imageId)
    return document
  for (const child of document.content ?? []) {
    const match = sourceImage(child, imageId)
    if (match)
      return match
  }
  return null
}

function topicImageSource(
  node: NodeJSON,
  source: Extract<ImageOcclusionSourceReference, { kind: 'topic-image' }>,
): ImageOcclusionSource {
  const src = node.attrs?.src
  if (typeof src !== 'string' || src.length === 0)
    throw new TypeError(`Image ${source.imageId} source must be a non-empty string`)
  return { ...source, src }
}

interface ResolvedImageOcclusionSource {
  snapshotSource: ImageOcclusionSource
  topic: NoteEntryNode
}

function normalizeSourceReference(source: ImageOcclusionSourceReference): ImageOcclusionSourceReference {
  if (source === null || typeof source !== 'object')
    throw new TypeError('Image occlusion source must be an object')
  const topicId = normalizeNonEmptyString(source.topicId, 'Source Topic id')
  if (source.kind === 'topic-image') {
    return {
      imageId: normalizeNonEmptyString(source.imageId, 'Source image id'),
      kind: 'topic-image',
      topicId,
    }
  }
  if (source.kind === 'reader-region') {
    return {
      annotationId: normalizeNonEmptyString(source.annotationId, 'Reader annotation id'),
      kind: 'reader-region',
      topicId,
    }
  }
  throw new TypeError(`Unknown image occlusion source kind: ${String((source as { kind?: unknown }).kind)}`)
}

function sourceSignature(source: ImageOcclusionSource): string {
  return source.kind === 'topic-image' ? source.src : JSON.stringify(source.anchor)
}

function assertTopicImageSource(
  runtime: EditorNoteDocument,
  source: Extract<ImageOcclusionSourceReference, { kind: 'topic-image' }>,
): ResolvedImageOcclusionSource {
  const topic = findNoteEntry(runtime.doc, source.topicId)
  if (readTopicType(topic.data, `Topic ${source.topicId} type`) !== 'regular')
    throw new TypeError(`ImageOcclusionTopic source ${source.topicId} must be a RegularTopic`)
  const blockTreeKey = readString(topic.data, TOPIC_BLOCK_TREE_KEY, `Topic ${source.topicId} Block tree key`)
  const document = createNodeJsonFromLoroTree(runtime.doc.getTree(blockTreeKey))
  if (!document)
    throw new Error(`Topic ${source.topicId} does not contain an initialized document`)
  const matchedImage = sourceImage(document, source.imageId)
  if (!matchedImage)
    throw new Error(`RegularTopic ${source.topicId} does not contain image ${source.imageId}`)
  return { snapshotSource: topicImageSource(matchedImage, source), topic }
}

function assertReaderRegionSource(
  runtime: EditorNoteDocument,
  source: Extract<ImageOcclusionSourceReference, { kind: 'reader-region' }>,
): ResolvedImageOcclusionSource {
  const topic = findNoteEntry(runtime.doc, source.topicId)
  if (readTopicType(topic.data, `Topic ${source.topicId} type`) !== 'book')
    throw new TypeError(`Reader region source ${source.topicId} must be a BookTopic`)
  const annotationsKey = readString(
    topic.data,
    BOOK_ANNOTATIONS_KEY,
    `BookTopic ${source.topicId} annotations key`,
  )
  const value = runtime.doc.getMap(annotationsKey).get(source.annotationId)
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(
      `BookTopic ${source.topicId} does not contain Reader annotation ${source.annotationId}`,
    )
  }
  const annotation = structuredClone(value) as ReadingAnnotation
  if (annotation.id !== source.annotationId) {
    throw new Error(
      `BookTopic ${source.topicId} Reader annotation ${source.annotationId} has mismatched identity`,
    )
  }
  const anchor = annotation.anchors[0]
  if (!anchor || anchor.type !== 'region') {
    throw new TypeError(
      `BookTopic ${source.topicId} Reader annotation ${source.annotationId} is not a region`,
    )
  }
  return {
    snapshotSource: { ...source, anchor: structuredClone(anchor) },
    topic,
  }
}

function assertImageOcclusionSource(
  runtime: EditorNoteDocument,
  sourceValue: ImageOcclusionSourceReference,
): ResolvedImageOcclusionSource {
  const source = normalizeSourceReference(sourceValue)
  return source.kind === 'topic-image'
    ? assertTopicImageSource(runtime, source)
    : assertReaderRegionSource(runtime, source)
}

export function getImageOcclusionSourceIdentity(
  runtime: EditorNoteDocument,
  source: ImageOcclusionSourceReference,
): ImageOcclusionSource {
  return structuredClone(assertImageOcclusionSource(runtime, source).snapshotSource)
}

export function findImageOcclusionTopicId(
  runtime: EditorNoteDocument,
  sourceValue: ImageOcclusionSourceReference,
): string | null {
  const source = normalizeSourceReference(sourceValue)
  const sourceKey = imageOcclusionSourceKey(source)
  let match: string | null = null
  for (const node of noteTree(runtime.doc).getNodes()) {
    if (node.data.get(ENTRY_KIND_KEY) !== 'topic' || node.data.get(TOPIC_TYPE_KEY) !== 'image-occlusion')
      continue
    const topicId = readString(node.data, ENTRY_ID_KEY, 'ImageOcclusionTopic id')
    if (imageOcclusionSourceKey(getImageOcclusionState(runtime, topicId).source) !== sourceKey)
      continue
    if (match)
      throw new Error(`Image occlusion source ${sourceKey} has multiple ImageOcclusionTopics`)
    match = topicId
  }
  return match
}

interface CreateImageOcclusionNodeInput extends Omit<CreateImageOcclusionTopicInput, 'snapshot'> {
  image: ImageOcclusionState['image']
  snapshotSource: ImageOcclusionSource
}

export function createImageOcclusionNode(
  runtime: EditorNoteDocument,
  input: CreateImageOcclusionNodeInput,
): string {
  const sourceReference = normalizeSourceReference(input.source)
  const source = assertImageOcclusionSource(runtime, sourceReference)
  if (sourceSignature(source.snapshotSource) !== sourceSignature(input.snapshotSource)) {
    throw new Error(
      `Image occlusion source ${imageOcclusionSourceKey(sourceReference)} changed while its snapshot was created`,
    )
  }
  const existing = findImageOcclusionTopicId(runtime, sourceReference)
  if (existing)
    throw new Error(`Image occlusion source ${imageOcclusionSourceKey(sourceReference)} already belongs to ImageOcclusionTopic ${existing}`)

  const entryId = crypto.randomUUID()
  const topic = Effect.runSync(validateLoroTopic({
    entry: {
      entryId,
      kind: 'topic',
      title: normalizeTopicTitle(input.title),
      topicType: 'image-occlusion',
    },
    state: {
      image: structuredClone(input.image),
      mode: 'hide-all',
      shapes: [],
      source: structuredClone(sourceReference),
    },
  }))
  if (topic.entry.topicType !== 'image-occlusion' || !('state' in topic))
    throw new TypeError(`Topic ${entryId} is not an ImageOcclusionTopic`)
  const node = noteTree(runtime.doc).createNode(source.topic.id, resolveNoteEntryIndex(input.index))
  node.data.set(ENTRY_ID_KEY, entryId)
  node.data.set(ENTRY_KIND_KEY, 'topic')
  node.data.set(TOPIC_TYPE_KEY, 'image-occlusion')
  node.data.set(TOPIC_TITLE_KEY, topic.entry.title)
  const state = node.data.ensureMergeableMap(IMAGE_OCCLUSION_STATE_KEY)
  for (const [key, value] of Object.entries(topic.state))
    state.set(key, value)
  return entryId
}

export function getImageOcclusionState(
  runtime: EditorNoteDocument,
  topicId: string,
): ImageOcclusionState {
  const topic = Effect.runSync(validateLoroTopic(readImageOcclusionValidationInput(runtime, topicId)))
  if (topic.entry.topicType !== 'image-occlusion' || !('state' in topic))
    throw new TypeError(`Topic ${topicId} is not an ImageOcclusionTopic`)
  return structuredClone(topic.state)
}

export function setImageOcclusionState(
  runtime: EditorNoteDocument,
  topicId: string,
  stateValue: ImageOcclusionState,
): void {
  const node = imageOcclusionNode(runtime, topicId)
  const current = getImageOcclusionState(runtime, topicId)
  if (imageOcclusionSourceKey(stateValue.source) !== imageOcclusionSourceKey(current.source))
    throw new TypeError(`ImageOcclusionTopic ${topicId} cannot change its source`)
  if (stateValue.image.src !== current.image.src
    || stateValue.image.width !== current.image.width
    || stateValue.image.height !== current.image.height) {
    throw new TypeError(`ImageOcclusionTopic ${topicId} cannot change its image snapshot`)
  }
  const input = {
    entry: imageOcclusionEntryValue(node),
    state: structuredClone(stateValue),
  }
  const topic = Effect.runSync(validateLoroTopic(input))
  if (topic.entry.topicType !== 'image-occlusion' || !('state' in topic))
    throw new TypeError(`Topic ${topicId} is not an ImageOcclusionTopic`)
  const map = imageOcclusionStateMap(node)
  for (const key of Object.keys(map.toJSON()))
    map.delete(key)
  for (const [key, value] of Object.entries(topic.state))
    map.set(key, value)
  runtime.doc.commit({ origin: 'image-occlusion:set-state' })
}

export function projectImageOcclusionContent(
  runtime: EditorNoteDocument,
  topicId: string,
): TopicContentProjection {
  const node = imageOcclusionNode(runtime, topicId)
  getImageOcclusionState(runtime, topicId)
  return {
    blocks: [],
    title: readTopicTitle(node.data, `ImageOcclusionTopic ${topicId} title`),
    topicId,
  }
}
