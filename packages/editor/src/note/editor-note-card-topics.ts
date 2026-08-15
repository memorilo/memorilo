import type { NodeJSON } from 'prosekit/core'
import type { CardTopicReconciliationResult, CardTopicSource } from './editor-note'
import type { EditorNoteRuntime } from './editor-note-runtime'
import { updateLoroTreeFromPmState } from '@memorilo/loro-prosemirror-tree/document'
import { EditorState } from 'prosekit/pm/state'
import { assertEditorMode } from '../common/editor-mode'
import { normalizeOutlineDocument } from '../common/outline-document'
import { topicProseMirrorSchema } from '../schema/topic-prosemirror-schema'
import {
  cardTopicSourceIdentity,
  cardTopicTitle,
  projectCardTopicDefinitions,
} from './card-topic-projection'
import {
  ENTRY_ID_KEY,
  ENTRY_KIND_KEY,
  findNoteEntry,
  readCardTopicSource,
  readString,
  readTopicType,
  TOPIC_CARD_SOURCE_KEY,
  TOPIC_EDITOR_MODE_KEY,
  TOPIC_TITLE_KEY,
} from './editor-note-crdt'
import {
  readTopicValidationInput,
  topicBlockTree,
  validateTopicInput,
} from './editor-note-topic-documents'
import { createTopicNode } from './editor-note-topic-factory'

function sameDocument(left: NodeJSON, right: NodeJSON): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function topicDocument(runtime: EditorNoteRuntime, topicId: string): NodeJSON {
  const validation = readTopicValidationInput(runtime, topicId)
  if (!('document' in validation))
    throw new TypeError(`Topic ${topicId} does not contain one editable document`)
  return validation.document
}

function replaceTopicDocument(runtime: EditorNoteRuntime, topicId: string, document: NodeJSON): void {
  const normalized = normalizeOutlineDocument(document)
  const validation = readTopicValidationInput(runtime, topicId)
  if (!('document' in validation))
    throw new TypeError(`Topic ${topicId} does not contain one editable document`)
  validateTopicInput({ ...validation, document: normalized })
  const node = findNoteEntry(runtime.doc, topicId)
  const state = EditorState.create({
    doc: topicProseMirrorSchema.nodeFromJSON(normalized),
    schema: topicProseMirrorSchema,
  })
  updateLoroTreeFromPmState(runtime.doc, topicBlockTree(runtime, node), new Map(), state)
}

function childCardTopics(runtime: EditorNoteRuntime, sourceTopicId: string) {
  const source = findNoteEntry(runtime.doc, sourceTopicId)
  return (source.children() ?? []).flatMap((node) => {
    if (node.data.get(ENTRY_KIND_KEY) !== 'topic' || readTopicType(node.data, 'Child Topic type') !== 'regular')
      return []
    const cardSource = readCardTopicSource(node.data, 'Child Card Topic source')
    return cardSource?.sourceTopicId === sourceTopicId ? [{ cardSource, node }] : []
  })
}

function expectedDefinition(runtime: EditorNoteRuntime, source: CardTopicSource) {
  const parentNode = findNoteEntry(runtime.doc, source.sourceTopicId)
  const parentSource = readTopicType(parentNode.data, `Topic ${source.sourceTopicId} type`) === 'regular'
    ? readCardTopicSource(parentNode.data, `Topic ${source.sourceTopicId} card source`)
    : null
  return projectCardTopicDefinitions(topicDocument(runtime, source.sourceTopicId), parentSource ?? undefined)
    .find(definition => cardTopicSourceIdentity(definition) === cardTopicSourceIdentity(source)) ?? null
}

export class EditorNoteCardTopics {
  readonly #runtime: EditorNoteRuntime

  constructor(runtime: EditorNoteRuntime) {
    this.#runtime = runtime
  }

  reconcile(input: { document: NodeJSON, topicId: string }): CardTopicReconciliationResult {
    return this.#runtime.runMutation(() => {
      const sourceNode = findNoteEntry(this.#runtime.doc, input.topicId)
      if (sourceNode.data.get(ENTRY_KIND_KEY) !== 'topic')
        throw new TypeError(`NoteEntry ${input.topicId} is not a Topic`)
      const topicType = readTopicType(sourceNode.data, `Topic ${input.topicId} type`)
      if (topicType !== 'regular' && topicType !== 'book')
        return { detachedTopicId: null }

      const ownSource = topicType === 'regular'
        ? readCardTopicSource(sourceNode.data, `Topic ${input.topicId} card source`)
        : null
      let detachedTopicId: string | null = null
      if (ownSource?.syncStatus === 'synced') {
        const expected = expectedDefinition(this.#runtime, ownSource)
        if (!expected || !sameDocument(normalizeOutlineDocument(input.document), normalizeOutlineDocument(expected.document))) {
          const detached = { ...ownSource, syncStatus: 'detached' as const }
          validateTopicInput({
            ...readTopicValidationInput(this.#runtime, input.topicId),
            entry: { ...sourceNode.data.toJSON(), [TOPIC_CARD_SOURCE_KEY]: detached },
          })
          sourceNode.data.set(TOPIC_CARD_SOURCE_KEY, detached)
          detachedTopicId = input.topicId
        }
      }

      const definitions = projectCardTopicDefinitions(input.document, ownSource ?? undefined)
      const existing = childCardTopics(this.#runtime, input.topicId)
      const existingBySource = new Map(existing.map(child => [cardTopicSourceIdentity(child.cardSource), child]))
      const seen = new Set<string>()
      const mode = assertEditorMode(sourceNode.data.get(TOPIC_EDITOR_MODE_KEY), `Topic ${input.topicId} Editor mode`)

      for (const definition of definitions) {
        const key = cardTopicSourceIdentity(definition)
        seen.add(key)
        const child = existingBySource.get(key)
        if (!child) {
          createTopicNode(this.#runtime.doc, {
            cardSource: {
              kind: definition.kind,
              sourceId: definition.sourceId,
              sourceTopicId: input.topicId,
              syncStatus: 'synced',
            },
            initialContent: definition.document,
            mode,
            title: cardTopicTitle(definition.document),
          }, sourceNode.id)
          continue
        }
        if (child.cardSource.syncStatus === 'detached')
          continue
        const childId = readString(child.node.data, ENTRY_ID_KEY, 'Card Topic id')
        if (child.cardSource.kind !== definition.kind) {
          child.node.data.set(TOPIC_CARD_SOURCE_KEY, {
            ...child.cardSource,
            kind: definition.kind,
          })
        }
        if (!sameDocument(topicDocument(this.#runtime, childId), normalizeOutlineDocument(definition.document)))
          replaceTopicDocument(this.#runtime, childId, definition.document)
        child.node.data.set(TOPIC_TITLE_KEY, cardTopicTitle(definition.document))
      }

      for (const child of existing) {
        if (child.cardSource.syncStatus !== 'synced' || seen.has(cardTopicSourceIdentity(child.cardSource)))
          continue
        const detached = { ...child.cardSource, syncStatus: 'detached' as const }
        child.node.data.set(TOPIC_CARD_SOURCE_KEY, detached)
      }

      this.#runtime.doc.commit({ origin: 'card-topic:reconcile' })
      return { detachedTopicId }
    })
  }

  resync(topicId: string): void {
    this.#runtime.runMutation(() => {
      const node = findNoteEntry(this.#runtime.doc, topicId)
      if (readTopicType(node.data, `Topic ${topicId} type`) !== 'regular')
        throw new TypeError(`Topic ${topicId} is not a Card Topic`)
      const source = readCardTopicSource(node.data, `Topic ${topicId} card source`)
      if (!source)
        throw new TypeError(`Topic ${topicId} is not a Card Topic`)
      const definition = expectedDefinition(this.#runtime, source)
      if (!definition)
        throw new Error(`Card Topic ${topicId} source is no longer available`)
      const synced = { ...source, syncStatus: 'synced' as const }
      replaceTopicDocument(this.#runtime, topicId, definition.document)
      node.data.set(TOPIC_CARD_SOURCE_KEY, synced)
      node.data.set(TOPIC_TITLE_KEY, cardTopicTitle(definition.document))
      this.#runtime.doc.commit({ origin: 'card-topic:resync' })
    })
  }
}
