import type { LoroMap } from 'loro-crdt'
import type { LoroDocType, LoroNode } from 'loro-prosemirror'
import type { NodeJSON } from 'prosekit/core'
import type { EditorAdapters } from '../adapters/editor-adapters'
import type { EditorLoroDocument, LoroEditorRuntime } from '../document/loro-document'
import type { OutlineOptions } from './outline-runtime'

import { LoroDoc as LoroDocument } from 'loro-crdt'
import { createNodeFromLoroObj, CursorEphemeralStore, ROOT_DOC_KEY, updateLoroToPmState } from 'loro-prosemirror'
import { createEditor } from 'prosekit/core'
import { resolveEditorLoroDocument } from '../document/loro-document'
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
  loroSnapshot?: Uint8Array | null
  loroDocument?: EditorLoroDocument
}

function createLoroRuntime(snapshot: Uint8Array | null | undefined): LoroEditorRuntime {
  const doc = new LoroDocument() as LoroDocType
  if (snapshot !== null && snapshot !== undefined) {
    if (!(snapshot instanceof Uint8Array) || snapshot.byteLength === 0)
      throw new TypeError('A Loro snapshot must be a non-empty Uint8Array')
    doc.import(snapshot)
  }
  return {
    doc,
    mapping: new Map(),
    presence: new CursorEphemeralStore(doc.peerIdStr),
  }
}

export function createEditorSession(options: EditorSessionOptions) {
  const store = createEditorStore()
  const defaultContent = normalizeOutlineDocument(options.initialContent ?? sampleContent)
  const defaultFocus = options.outline?.defaultFocus
  const outlineRuntime = new OutlineRuntime({
    focusBlockId: defaultFocus ? resolveOutlineFocusTarget(defaultContent, defaultFocus) : null,
    outdentBehavior: options.outline?.defaultOutdentBehavior,
  })
  if (options.loroDocument !== undefined && options.loroSnapshot !== undefined)
    throw new TypeError('Provide either a Loro document or a snapshot, not both')
  const loro = options.loroDocument === undefined
    ? (options.loroSnapshot === undefined ? undefined : createLoroRuntime(options.loroSnapshot))
    : resolveEditorLoroDocument(options.loroDocument)
  const configured = createEditorExtension(options.adapters, store, outlineRuntime, (document) => {
    outlineRuntime.reconcileDocument(document)
    options.onDocumentChange(document)
  }, loro)
  const editor = createEditor({ extension: configured.extension, defaultContent })

  if (loro) {
    const root = loro.doc.getMap(ROOT_DOC_KEY) as LoroMap & LoroNode
    if (root.size === 0) {
      updateLoroToPmState(loro.doc, loro.mapping, editor.state)
    }
    else {
      const document = createNodeFromLoroObj(editor.schema, root, loro.mapping)
      editor.setContent(document)
      outlineRuntime.reconcileDocument(editor.getDocJSON())
    }
  }

  return { configured, editor, loro, outlineRuntime, store }
}

export type EditorSession = ReturnType<typeof createEditorSession>
