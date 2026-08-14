import type { LoroDoc } from 'loro-crdt'
import type { NodeJSON } from 'prosekit/core'
import type { ImageOcclusionState } from '../image-occlusion/image-occlusion-model'
import type {
  CreateImageOcclusionTopicInput,
  ImageOcclusionTopicValidationInput,
} from './editor-note'
import type { EditorNoteDocument } from './editor-note-runtime'
import type { TopicContentProjection } from './topic-projection'
import { createNodeJsonFromLoroTree } from '@memorilo/loro-prosemirror-tree/document'
import { Effect } from 'effect'
import { LoroMap } from 'loro-crdt'
import { EditorMode } from '../common/editor-mode'
import { validateLoroTopic } from '../schema/topic-schema'
import {
  ENTRY_ID_KEY,
  ENTRY_KIND_KEY,
  findNoteEntry,
  IMAGE_OCCLUSION_STATE_KEY,
  noteTree,
  readString,
  readTopicTitle,
  readTopicType,
  TOPIC_BLOCK_TREE_KEY,
  TOPIC_EDITOR_MODE_KEY,
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
    editorMode: node.data.get(TOPIC_EDITOR_MODE_KEY),
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

function assertSourceImage(
  runtime: EditorNoteDocument,
  sourceTopicId: string,
  sourceImageId: string,
): NoteEntryNode {
  const source = findNoteEntry(runtime.doc, sourceTopicId)
  if (readTopicType(source.data, `Topic ${sourceTopicId} type`) !== 'regular')
    throw new TypeError(`ImageOcclusionTopic source ${sourceTopicId} must be a RegularTopic`)
  const blockTreeKey = readString(source.data, TOPIC_BLOCK_TREE_KEY, `Topic ${sourceTopicId} Block tree key`)
  const document = createNodeJsonFromLoroTree(runtime.doc.getTree(blockTreeKey))
  if (!document)
    throw new Error(`Topic ${sourceTopicId} does not contain an initialized document`)
  if (!sourceImage(document, sourceImageId))
    throw new Error(`RegularTopic ${sourceTopicId} does not contain image ${sourceImageId}`)
  return source
}

export function findImageOcclusionTopicId(
  runtime: EditorNoteDocument,
  sourceTopicIdValue: string,
  sourceImageIdValue: string,
): string | null {
  const sourceTopicId = normalizeNonEmptyString(sourceTopicIdValue, 'Source Topic id')
  const sourceImageId = normalizeNonEmptyString(sourceImageIdValue, 'Source image id')
  let match: string | null = null
  for (const node of noteTree(runtime.doc).getNodes()) {
    if (node.data.get(ENTRY_KIND_KEY) !== 'topic' || node.data.get(TOPIC_TYPE_KEY) !== 'image-occlusion')
      continue
    const state = imageOcclusionStateMap(node)
    if (state.get('sourceTopicId') !== sourceTopicId || state.get('sourceImageId') !== sourceImageId)
      continue
    const topicId = readString(node.data, ENTRY_ID_KEY, 'ImageOcclusionTopic id')
    if (match)
      throw new Error(`Image ${sourceTopicId}:${sourceImageId} has multiple ImageOcclusionTopics`)
    match = topicId
  }
  return match
}

export function createImageOcclusionNode(
  runtime: EditorNoteDocument,
  input: CreateImageOcclusionTopicInput,
): string {
  const sourceTopicId = normalizeNonEmptyString(input.sourceTopicId, 'Source Topic id')
  const sourceImageId = normalizeNonEmptyString(input.sourceImageId, 'Source image id')
  const source = assertSourceImage(runtime, sourceTopicId, sourceImageId)
  const existing = findImageOcclusionTopicId(runtime, sourceTopicId, sourceImageId)
  if (existing)
    throw new Error(`Image ${sourceTopicId}:${sourceImageId} already belongs to ImageOcclusionTopic ${existing}`)

  const entryId = crypto.randomUUID()
  const node = noteTree(runtime.doc).createNode(source.id, resolveNoteEntryIndex(input.index))
  node.data.set(ENTRY_ID_KEY, entryId)
  node.data.set(ENTRY_KIND_KEY, 'topic')
  node.data.set(TOPIC_TYPE_KEY, 'image-occlusion')
  node.data.set(TOPIC_TITLE_KEY, normalizeTopicTitle(input.title))
  node.data.set(TOPIC_EDITOR_MODE_KEY, EditorMode.Document)
  const state = node.data.ensureMergeableMap(IMAGE_OCCLUSION_STATE_KEY)
  state.set('image', structuredClone(input.image))
  state.set('mode', 'hide-all')
  state.set('shapes', [])
  state.set('sourceImageId', sourceImageId)
  state.set('sourceTopicId', sourceTopicId)
  Effect.runSync(validateLoroTopic(readImageOcclusionValidationInput(runtime, entryId)))
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
  if (stateValue.sourceTopicId !== current.sourceTopicId)
    throw new TypeError(`ImageOcclusionTopic ${topicId} cannot change its source Topic`)
  if (stateValue.sourceImageId !== current.sourceImageId)
    throw new TypeError(`ImageOcclusionTopic ${topicId} cannot change its source image`)
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
