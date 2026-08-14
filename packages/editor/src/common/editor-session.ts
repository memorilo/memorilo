import type { NodeJSON } from 'prosekit/core'
import type { EditorAdapters } from '../adapters/editor-adapters'
import type { CardReviewOptions } from '../card/card-review-runtime'
import type { EditorCardIntegration } from '../card/card-sync'
import type { EditorTopicDocument } from '../note/editor-note'
import type { OutlineOptions } from './outline-runtime'

import { createResourceScope } from '@memorilo/effect-lifecycle'
import { createNodeJsonFromLoroTree } from '@memorilo/loro-prosemirror-tree'
import { createEditor } from 'prosekit/core'
import { CardReviewRuntime } from '../card/card-review-runtime'
import { createEditorCardSync } from '../card/card-sync'
import { createEditorExtension } from '../extension/create-editor-extension'
import { resolveEditorTopicDocument } from '../note/editor-topic-runtime'
import { createEditorStore } from '../state/editor-store'
import { normalizeOutlineDocument } from './outline-document'
import { OutlineRuntime, resolveOutlineFocusTarget } from './outline-runtime'

export interface EditorSessionOptions {
  adapters: EditorAdapters
  cardReview?: CardReviewOptions
  cards?: EditorCardIntegration
  onDocumentChange: (document: NodeJSON) => void
  outline?: OutlineOptions
  readOnly: boolean
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
  const cardReviewRuntime = options.cardReview
    ? new CardReviewRuntime(options.cardReview)
    : undefined
  const cardSync = options.cards
    ? createEditorCardSync({
        ...options.cards,
        noteId: options.topicDocument.noteId,
        topicId: options.topicDocument.documentId,
      })
    : undefined
  const scheduleCardSync = (document: NodeJSON) => {
    const operation = cardSync?.schedule(document)
    if (operation) {
      void operation.then(
        () => undefined,
        () => undefined,
      )
    }
  }
  const configured = createEditorExtension(options.adapters, store, outlineRuntime, (document) => {
    outlineRuntime.reconcileDocument(document)
    options.onDocumentChange(document)
    scheduleCardSync(document)
  }, topic, options.readOnly, cardReviewRuntime)
  const resources = createResourceScope('Editor session')
  resources.own({
    close: () => configured.networkImagePasteRuntime.close(),
    name: 'Network image paste runtime',
  })
  resources.own({ close: () => configured.tagRuntime.close(), name: 'Tag runtime' })
  resources.own({ close: () => configured.uploadRuntime.close(), name: 'Upload runtime' })
  if (cardSync)
    resources.own({ close: () => cardSync.close(), name: 'Card sync' })

  let editor: ReturnType<typeof createEditor>
  try {
    editor = createEditor({ extension: configured.extension, defaultContent })
    outlineRuntime.reconcileDocument(editor.getDocJSON())
    scheduleCardSync(editor.getDocJSON())
    resources.commit()
  }
  catch (error) {
    void resources.close().then(
      () => undefined,
      cleanupError => console.error('Failed to close a partially constructed Editor session', cleanupError),
    )
    throw error
  }

  return {
    adapters: options.adapters,
    cardReviewRuntime,
    cardSync,
    close: resources.close,
    configured,
    editor,
    outlineRuntime,
    store,
    topic,
    topicDocument: options.topicDocument,
  }
}

export type EditorSession = ReturnType<typeof createEditorSession>
