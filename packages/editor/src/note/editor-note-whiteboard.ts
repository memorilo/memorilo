import type { LoroDoc } from 'loro-crdt'
import type { NodeJSON } from 'prosekit/core'
import type {
  CreateEmbeddedEditorInput,
  CreateWhiteboardTopicInput,
  EmbeddedEditorSnapshot,
  EmbeddedEditorValidationInput,
  TopicValidationInput,
  WhiteboardScene,
  WhiteboardTopicValidationInput,
} from './editor-note'
import type { EditorNoteDocument } from './editor-note-runtime'
import type { TopicContentProjection } from './topic-projection'
import {
  createNodeJsonFromLoroTree,
  initializeLoroTreeFromJson,
} from '@memorilo/loro-prosemirror-tree/document'
import { LoroMap, LoroTree } from 'loro-crdt'
import { assertEditorMode } from '../common/editor-mode'
import { normalizeOutlineDocument } from '../common/outline-document'
import {
  EMBEDDED_EDITOR_DOCUMENT_KEY,
  EMBEDDED_EDITOR_ID_KEY,
  EMBEDDED_EDITOR_MODE_KEY,
  ENTRY_ID_KEY,
  ENTRY_KIND_KEY,
  findNoteEntry,
  noteTree,
  readString,
  readTopicTitle,
  readTopicType,
  TOPIC_TITLE_KEY,
  TOPIC_TYPE_KEY,
  WHITEBOARD_EMBEDDED_EDITORS_KEY,
  WHITEBOARD_SCENE_KEY,
} from './editor-note-crdt'
import { normalizeNonEmptyString, normalizeTopicTitle, resolveNoteEntryIndex } from './editor-note-validation'
import { projectTopicBlocks } from './topic-projection'
import { hasTopicUserContent } from './topic-user-content'

type NoteEntryNode = ReturnType<ReturnType<LoroDoc['getTree']>['getNodes']>[number]

function canonicalSceneValue(value: unknown): unknown {
  if (Array.isArray(value))
    return value.map(canonicalSceneValue)
  if (value === null || typeof value !== 'object')
    return value
  return Object.fromEntries(Object.keys(value).sort().map(key => [
    key,
    canonicalSceneValue((value as Record<string, unknown>)[key]),
  ]))
}

export function whiteboardSceneSignature(scene: WhiteboardScene): string {
  if (scene === null || typeof scene !== 'object' || Array.isArray(scene))
    throw new TypeError('WhiteboardTopic scene must be an object')
  return JSON.stringify(canonicalSceneValue(scene))
}

function emptyTopicDocument(): NodeJSON {
  return { type: 'doc', content: [{ type: 'paragraph' }] }
}

function whiteboardData(node: NoteEntryNode): LoroMap {
  const entryId = readString(node.data, ENTRY_ID_KEY, 'WhiteboardTopic id')
  if (readTopicType(node.data, `Topic ${entryId} type`) !== 'whiteboard')
    throw new TypeError(`Topic ${entryId} is not a WhiteboardTopic`)
  return node.data
}

function whiteboardEntryValue(node: NoteEntryNode): Record<string, unknown> {
  return {
    entryId: readString(node.data, ENTRY_ID_KEY, 'WhiteboardTopic id'),
    kind: node.data.get(ENTRY_KIND_KEY),
    title: readTopicTitle(node.data, 'WhiteboardTopic title'),
    topicType: node.data.get(TOPIC_TYPE_KEY),
  }
}

function whiteboardNode(runtime: EditorNoteDocument, topicId: string): NoteEntryNode {
  return findNoteEntry(runtime.doc, normalizeNonEmptyString(topicId, 'WhiteboardTopic id'))
}

function whiteboardSceneMap(node: NoteEntryNode): LoroMap {
  const data = whiteboardData(node)
  const value = data.get(WHITEBOARD_SCENE_KEY)
  if (!(value instanceof LoroMap))
    throw new Error(`WhiteboardTopic ${readString(data, ENTRY_ID_KEY, 'WhiteboardTopic id')} scene must be a LoroMap`)
  return value
}

function embeddedEditorsMap(node: NoteEntryNode): LoroMap {
  const data = whiteboardData(node)
  const value = data.get(WHITEBOARD_EMBEDDED_EDITORS_KEY)
  if (!(value instanceof LoroMap))
    throw new Error(`WhiteboardTopic ${readString(data, ENTRY_ID_KEY, 'WhiteboardTopic id')} embeddedEditors must be a LoroMap`)
  return value
}

function embeddedEditorState(node: NoteEntryNode, editorId: string): LoroMap {
  const normalizedEditorId = normalizeNonEmptyString(editorId, 'Embedded Editor id')
  const value = embeddedEditorsMap(node).get(normalizedEditorId)
  if (!(value instanceof LoroMap))
    throw new Error(`Unknown Embedded Editor: ${normalizedEditorId}`)
  const storedId = readString(value, EMBEDDED_EDITOR_ID_KEY, `Embedded Editor ${normalizedEditorId} id`)
  if (storedId !== normalizedEditorId)
    throw new Error(`Embedded Editor map key ${normalizedEditorId} does not match stored id ${storedId}`)
  assertEditorMode(value.get(EMBEDDED_EDITOR_MODE_KEY), `Embedded Editor ${normalizedEditorId} mode`)
  return value
}

export function whiteboardEmbeddedEditorTree(
  runtime: EditorNoteDocument,
  topicId: string,
  editorId: string,
): LoroTree {
  const state = embeddedEditorState(whiteboardNode(runtime, topicId), editorId)
  const value = state.get(EMBEDDED_EDITOR_DOCUMENT_KEY)
  if (!(value instanceof LoroTree))
    throw new Error(`Embedded Editor ${editorId} document must be a LoroTree`)
  return value
}

function embeddedEditorValidation(
  runtime: EditorNoteDocument,
  topicId: string,
): Record<string, EmbeddedEditorValidationInput> {
  const node = whiteboardNode(runtime, topicId)
  const result: Record<string, EmbeddedEditorValidationInput> = {}
  for (const editorId of Object.keys(embeddedEditorsMap(node).toJSON())) {
    const state = embeddedEditorState(node, editorId)
    const document = createNodeJsonFromLoroTree(whiteboardEmbeddedEditorTree(runtime, topicId, editorId))
    if (!document)
      throw new Error(`Embedded Editor ${editorId} does not contain an initialized document`)
    result[editorId] = {
      document,
      editorId: readString(state, EMBEDDED_EDITOR_ID_KEY, `Embedded Editor ${editorId} id`),
      editorMode: assertEditorMode(state.get(EMBEDDED_EDITOR_MODE_KEY), `Embedded Editor ${editorId} mode`),
    }
  }
  return result
}

export function readWhiteboardValidationInput(
  runtime: EditorNoteDocument,
  topicId: string,
): WhiteboardTopicValidationInput {
  const node = whiteboardNode(runtime, topicId)
  return {
    embeddedEditors: embeddedEditorValidation(runtime, topicId),
    entry: whiteboardEntryValue(node),
    scene: whiteboardSceneMap(node).toJSON(),
  }
}

export function projectWhiteboardContent(
  runtime: EditorNoteDocument,
  topicId: string,
): TopicContentProjection {
  const normalizedTopicId = normalizeNonEmptyString(topicId, 'WhiteboardTopic id')
  const node = whiteboardNode(runtime, normalizedTopicId)
  const blocks = getWhiteboardEmbeddedEditors(runtime, normalizedTopicId).flatMap((editor) => {
    const document = createNodeJsonFromLoroTree(whiteboardEmbeddedEditorTree(runtime, normalizedTopicId, editor.editorId))
    if (!document)
      throw new Error(`Embedded Editor ${editor.editorId} does not contain an initialized document`)
    return projectTopicBlocks(document)
  })
  const explicitTitle = readTopicTitle(node.data, `WhiteboardTopic ${normalizedTopicId} title`)
  const firstBlock = blocks.at(0)
  return {
    blocks,
    title: explicitTitle.length > 0
      ? explicitTitle
      : firstBlock?.text.split(/\r?\n/u, 1)[0]?.trim() ?? '',
    topicId: normalizedTopicId,
  }
}

export function createWhiteboardNode(
  doc: LoroDoc,
  input: CreateWhiteboardTopicInput,
  parentNodeId?: Parameters<ReturnType<LoroDoc['getTree']>['createNode']>[0],
): string {
  const entryId = crypto.randomUUID()
  const node = noteTree(doc).createNode(parentNodeId, resolveNoteEntryIndex(input.index))
  node.data.set(ENTRY_ID_KEY, entryId)
  node.data.set(ENTRY_KIND_KEY, 'topic')
  node.data.set(TOPIC_TYPE_KEY, 'whiteboard')
  node.data.set(TOPIC_TITLE_KEY, normalizeTopicTitle(input.title))
  const scene = node.data.ensureMergeableMap(WHITEBOARD_SCENE_KEY)
  scene.set('elements', [])
  scene.set('appState', {})
  scene.set('files', {})
  node.data.ensureMergeableMap(WHITEBOARD_EMBEDDED_EDITORS_KEY)
  return entryId
}

export function createWhiteboardEmbeddedEditor(
  runtime: EditorNoteDocument,
  topicId: string,
  input: CreateEmbeddedEditorInput,
): string {
  const node = whiteboardNode(runtime, topicId)
  const mode = assertEditorMode(input.mode, 'Embedded Editor mode')
  const document = normalizeOutlineDocument(input.initialContent ?? emptyTopicDocument())
  const editorId = crypto.randomUUID()
  const state = embeddedEditorsMap(node).ensureMergeableMap(editorId)
  state.set(EMBEDDED_EDITOR_ID_KEY, editorId)
  state.set(EMBEDDED_EDITOR_MODE_KEY, mode)
  initializeLoroTreeFromJson(state.ensureMergeableTree(EMBEDDED_EDITOR_DOCUMENT_KEY), document)
  runtime.doc.commit({ origin: 'whiteboard:create-embedded-editor' })
  return editorId
}

export function deleteWhiteboardEmbeddedEditor(
  runtime: EditorNoteDocument,
  topicId: string,
  editorId: string,
): void {
  const node = whiteboardNode(runtime, topicId)
  const normalizedEditorId = normalizeNonEmptyString(editorId, 'Embedded Editor id')
  embeddedEditorState(node, normalizedEditorId)
  embeddedEditorsMap(node).delete(normalizedEditorId)
  runtime.doc.commit({ origin: 'whiteboard:delete-embedded-editor' })
}

function cloneEmbeddedEditorDocument(document: NodeJSON): NodeJSON {
  const ids = new Map<string, string>()
  const idAttributeNames = new Set([
    'backwardCardId',
    'blockId',
    'cardId',
    'cardItemDefinitionId',
    'definitionId',
    'forwardCardId',
    'groupId',
  ])
  const remap = (value: unknown, key?: string): unknown => {
    if (typeof value === 'string' && key !== undefined && idAttributeNames.has(key)) {
      const mapped = ids.get(value) ?? crypto.randomUUID()
      ids.set(value, mapped)
      return mapped
    }
    if (Array.isArray(value))
      return value.map(item => remap(item))
    if (value !== null && typeof value === 'object')
      return Object.fromEntries(Object.entries(value).map(([name, child]) => [name, remap(child, name)]))
    return value
  }
  return remap(document) as NodeJSON
}

export function duplicateWhiteboardEmbeddedEditor(
  runtime: EditorNoteDocument,
  topicId: string,
  editorId: string,
): string {
  const node = whiteboardNode(runtime, topicId)
  const normalizedEditorId = normalizeNonEmptyString(editorId, 'Embedded Editor id')
  const state = embeddedEditorState(node, normalizedEditorId)
  const document = createNodeJsonFromLoroTree(whiteboardEmbeddedEditorTree(runtime, topicId, normalizedEditorId))
  if (!document)
    throw new Error(`Embedded Editor ${normalizedEditorId} does not contain an initialized document`)
  return createWhiteboardEmbeddedEditor(runtime, topicId, {
    initialContent: cloneEmbeddedEditorDocument(document),
    mode: assertEditorMode(state.get(EMBEDDED_EDITOR_MODE_KEY), `Embedded Editor ${normalizedEditorId} mode`),
  })
}

export function getWhiteboardEmbeddedEditors(
  runtime: EditorNoteDocument,
  topicId: string,
): readonly EmbeddedEditorSnapshot[] {
  const node = whiteboardNode(runtime, topicId)
  return Object.keys(embeddedEditorsMap(node).toJSON()).sort().map(editorId => ({
    editorId,
    mode: assertEditorMode(embeddedEditorState(node, editorId).get(EMBEDDED_EDITOR_MODE_KEY), `Embedded Editor ${editorId} mode`),
  }))
}

export function getWhiteboardScene(runtime: EditorNoteDocument, topicId: string): WhiteboardScene {
  return structuredClone(whiteboardSceneMap(whiteboardNode(runtime, topicId)).toJSON()) as WhiteboardScene
}

export function setWhiteboardScene(runtime: EditorNoteDocument, topicId: string, scene: WhiteboardScene): void {
  const map = whiteboardSceneMap(whiteboardNode(runtime, topicId))
  const cloned = structuredClone(scene) as Record<string, unknown>
  if (whiteboardSceneSignature(map.toJSON()) === whiteboardSceneSignature(cloned))
    return
  for (const key of Object.keys(map.toJSON()))
    map.delete(key)
  for (const [key, value] of Object.entries(cloned))
    map.set(key, value)
  runtime.doc.commit({ origin: 'whiteboard:set-scene' })
}

export function getWhiteboardEmbeddedEditorMode(
  runtime: EditorNoteDocument,
  topicId: string,
  editorId: string,
) {
  return assertEditorMode(
    embeddedEditorState(whiteboardNode(runtime, topicId), editorId).get(EMBEDDED_EDITOR_MODE_KEY),
    `Embedded Editor ${editorId} mode`,
  )
}

export function setWhiteboardEmbeddedEditorMode(
  runtime: EditorNoteDocument,
  topicId: string,
  editorId: string,
  mode: unknown,
): void {
  const normalizedMode = assertEditorMode(mode, `Embedded Editor ${editorId} mode`)
  const state = embeddedEditorState(whiteboardNode(runtime, topicId), editorId)
  if (state.get(EMBEDDED_EDITOR_MODE_KEY) === normalizedMode)
    return
  state.set(EMBEDDED_EDITOR_MODE_KEY, normalizedMode)
  runtime.doc.commit({ origin: 'ui:set-topic-editor-mode' })
}

export function whiteboardHasUserContent(validation: TopicValidationInput): boolean {
  if (!('scene' in validation))
    throw new TypeError('Expected WhiteboardTopic validation input')
  if (validation.scene === null || typeof validation.scene !== 'object' || Array.isArray(validation.scene))
    throw new Error('WhiteboardTopic scene must be an object')
  const elements = (validation.scene as { elements?: unknown }).elements
  return (Array.isArray(elements) && elements.length > 0)
    || Object.values(validation.embeddedEditors).some(editor => hasTopicUserContent(editor.document))
}
