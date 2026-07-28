import type { NodeJSON } from 'prosekit/core'
import type { EditorAdapters } from '../adapters/editor-adapters'
import type { OutlineOptions } from './outline-runtime'

import { createEditor } from 'prosekit/core'
import { createEditorExtension } from '../extension/create-editor-extension'
import { sampleContent } from '../sample/sample-content'
import { createEditorStore } from '../state/editor-store'
import { normalizeOutlineDocument } from './outline-document'
import { OutlineRuntime, resolveOutlineFocusTarget } from './outline-runtime'

export interface EditorSessionOptions {
  adapters: EditorAdapters
  initialContent?: NodeJSON
  onDocumentChange: (document: NodeJSON) => void
  outline?: OutlineOptions
}

export function createEditorSession(options: EditorSessionOptions) {
  const store = createEditorStore()
  const defaultContent = normalizeOutlineDocument(options.initialContent ?? sampleContent)
  const defaultFocus = options.outline?.defaultFocus
  const outlineRuntime = new OutlineRuntime({
    focusBlockId: defaultFocus ? resolveOutlineFocusTarget(defaultContent, defaultFocus) : null,
    outdentBehavior: options.outline?.defaultOutdentBehavior,
  })
  const configured = createEditorExtension(options.adapters, store, outlineRuntime, (document) => {
    outlineRuntime.reconcileDocument(document)
    options.onDocumentChange(document)
  })
  const editor = createEditor({ extension: configured.extension, defaultContent })

  return { configured, editor, outlineRuntime, store }
}

export type EditorSession = ReturnType<typeof createEditorSession>
