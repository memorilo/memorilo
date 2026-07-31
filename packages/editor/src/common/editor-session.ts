import type { NodeJSON } from 'prosekit/core'
import type { EditorAdapters } from '../adapters/editor-adapters'
import type { EditorCardIntegration } from '../card/card-sync'
import type { EditorTopicDocument } from '../note/editor-note'
import type { OutlineOptions } from './outline-runtime'

import { createNodeJsonFromLoroTree } from '@memorilo/loro-prosemirror-tree'
import { createEditor } from 'prosekit/core'
import { createEditorCardSync } from '../card/card-sync'
import { createEditorExtension } from '../extension/create-editor-extension'
import { resolveEditorTopicDocument } from '../note/editor-topic-runtime'
import { createEditorStore } from '../state/editor-store'
import { normalizeOutlineDocument } from './outline-document'
import { OutlineRuntime, resolveOutlineFocusTarget } from './outline-runtime'

export interface EditorSessionOptions {
  adapters: EditorAdapters
  cards?: EditorCardIntegration
  onDocumentChange: (document: NodeJSON) => void
  outline?: OutlineOptions
  topicDocument: EditorTopicDocument
}

export function createEditorSession(options: EditorSessionOptions) {
  const store = createEditorStore()
  const topic = resolveEditorTopicDocument(options.topicDocument)
  const storedContent = createNodeJsonFromLoroTree(topic.tree)
  if (!storedContent)
    throw new Error(`Topic ${options.topicDocument.topicId} does not contain an initialized document`)
  const defaultContent = normalizeOutlineDocument(storedContent)
  const defaultFocus = options.outline?.defaultFocus
  const outlineRuntime = new OutlineRuntime({
    focusBlockId: defaultFocus ? resolveOutlineFocusTarget(defaultContent, defaultFocus) : null,
    outdentBehavior: options.outline?.defaultOutdentBehavior,
  })
  const cardSync = options.cards
    ? createEditorCardSync({
        ...options.cards,
        noteId: options.topicDocument.noteId,
        topicId: options.topicDocument.topicId,
      })
    : undefined
  const configured = createEditorExtension(options.adapters, store, outlineRuntime, (document) => {
    outlineRuntime.reconcileDocument(document)
    options.onDocumentChange(document)
    cardSync?.schedule(document)
  }, topic)
  const editor = createEditor({ extension: configured.extension, defaultContent })

  outlineRuntime.reconcileDocument(editor.getDocJSON())
  cardSync?.schedule(editor.getDocJSON())

  return { cardSync, configured, editor, outlineRuntime, store, topic }
}

export type EditorSession = ReturnType<typeof createEditorSession>
