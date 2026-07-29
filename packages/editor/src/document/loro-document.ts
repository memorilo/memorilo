import type { CursorEphemeralStore, LoroDocType, LoroNodeMapping } from 'loro-prosemirror'
import type { NodeJSON } from 'prosekit/core'

import { LoroDoc } from 'loro-crdt'
import { CursorEphemeralStore as LoroCursorEphemeralStore } from 'loro-prosemirror'

export interface LoroEditorRuntime {
  doc: LoroDocType
  mapping: LoroNodeMapping
  presence: CursorEphemeralStore
}

export interface EditorDocumentNode {
  attributes: Readonly<Record<string, unknown>>
  id: string
  kind: string
  ordinal: number
  parentId: string | null
  text: string
}

export interface EditorLoroChange {
  document: NodeJSON
  nodes: readonly EditorDocumentNode[]
  snapshot: Uint8Array
}

export interface EditorLoroVersion {
  readonly counter: number
  readonly peer: `${number}`
}

export interface EditorLoroDocument {
  checkout: (version: readonly EditorLoroVersion[]) => void
  checkoutLatest: () => void
  exportSnapshot: () => Uint8Array
  exportUpdates: (from?: readonly EditorLoroVersion[]) => Uint8Array
  getVersion: () => readonly EditorLoroVersion[]
  importUpdates: (updates: Uint8Array) => void
  isTimeTraveling: () => boolean
}

export interface EditorLoroOptions {
  document?: EditorLoroDocument
  onChange?: (change: EditorLoroChange) => void
  snapshot?: Uint8Array | null
}

const runtimes = new WeakMap<EditorLoroDocument, LoroEditorRuntime>()

function createLoroRuntime(snapshot?: Uint8Array): LoroEditorRuntime {
  const doc = new LoroDoc() as LoroDocType
  if (snapshot !== undefined) {
    if (!(snapshot instanceof Uint8Array) || snapshot.byteLength === 0)
      throw new TypeError('A Loro snapshot must be a non-empty Uint8Array')
    doc.import(snapshot)
  }
  return {
    doc,
    mapping: new Map(),
    presence: new LoroCursorEphemeralStore(doc.peerIdStr),
  }
}

export function createEditorLoroDocument(options: { snapshot?: Uint8Array } = {}): EditorLoroDocument {
  const runtime = createLoroRuntime(options.snapshot)
  const document: EditorLoroDocument = {
    checkout: version => runtime.doc.checkout([...version]),
    checkoutLatest: () => runtime.doc.checkoutToLatest(),
    exportSnapshot: () => new Uint8Array(runtime.doc.export({ mode: 'snapshot' })),
    exportUpdates: from => new Uint8Array(runtime.doc.export(from === undefined
      ? { mode: 'update' }
      : { mode: 'update', from: runtime.doc.frontiersToVV([...from]) })),
    getVersion: () => runtime.doc.frontiers().map(({ counter, peer }) => ({ counter, peer })),
    importUpdates: (updates) => {
      if (!(updates instanceof Uint8Array) || updates.byteLength === 0)
        throw new TypeError('Loro updates must be a non-empty Uint8Array')
      runtime.doc.import(updates)
    },
    isTimeTraveling: () => runtime.doc.isDetached(),
  }
  runtimes.set(document, runtime)
  return document
}

export function resolveEditorLoroDocument(document: EditorLoroDocument): LoroEditorRuntime {
  const runtime = runtimes.get(document)
  if (!runtime)
    throw new TypeError('Expected an editor Loro document created by createEditorLoroDocument')
  return runtime
}

const blockSeparators = new Set([
  'blockquote',
  'codeBlock',
  'heading',
  'paragraph',
  'tableCell',
  'tableHeader',
  'tableRow',
])

function appendNodeText(node: NodeJSON, output: string[]): void {
  if (node.type === 'list')
    return
  if (node.text !== undefined) {
    output.push(node.text)
    return
  }
  if (node.type === 'hardBreak') {
    output.push('\n')
    return
  }
  if (node.type === 'tag') {
    const label = node.attrs?.label
    if (typeof label === 'string')
      output.push(`#${label}`)
    return
  }
  if (node.type === 'image') {
    const alt = node.attrs?.alt
    if (typeof alt === 'string')
      output.push(alt)
    return
  }

  node.content?.forEach((child) => {
    appendNodeText(child, output)
    if (blockSeparators.has(child.type))
      output.push('\n')
  })
}

function ownText(node: NodeJSON): string {
  const output: string[] = []
  node.content?.forEach(child => appendNodeText(child, output))
  return output.join('').replace(/[\t ]*\n[\t ]*/gu, '\n').trim()
}

function readBlockId(node: NodeJSON): string {
  const id = node.attrs?.blockId
  if (typeof id !== 'string' || id.length === 0)
    throw new Error('Editor nodes require a stable blockId')
  return id
}

function readBlockKind(node: NodeJSON): string {
  const kind = node.attrs?.kind
  if (typeof kind !== 'string' || kind.length === 0)
    throw new Error(`Editor node ${readBlockId(node)} requires a kind`)
  return kind
}

export function projectEditorDocumentNodes(document: NodeJSON): readonly EditorDocumentNode[] {
  if (document.type !== 'doc')
    throw new TypeError(`Expected a doc node, received ${document.type}`)

  const nodes: EditorDocumentNode[] = []
  const visit = (node: NodeJSON, parentId: string | null, ordinal: number): void => {
    if (node.type !== 'list')
      throw new TypeError(`Expected a normalized list block, received ${node.type}`)
    const id = readBlockId(node)
    nodes.push({
      attributes: node.attrs ? structuredClone(node.attrs) : {},
      id,
      kind: readBlockKind(node),
      ordinal,
      parentId,
      text: ownText(node),
    })

    const children = node.content?.filter(child => child.type === 'list') ?? []
    children.forEach((child, childOrdinal) => visit(child, id, childOrdinal))
  }

  const roots = document.content ?? []
  roots.forEach((node, ordinal) => visit(node, null, ordinal))
  return nodes
}
