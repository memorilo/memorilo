import type { ContainerID, PeerID } from 'loro-crdt'
import type { Node as ProseMirrorNode } from 'prosemirror-model'
import type { EditorState, Selection } from 'prosemirror-state'
import type { DecorationAttrs } from 'prosemirror-view'
import type { LoroTreeSyncPluginState } from './sync-plugin'
import {
  Cursor,
  EphemeralStore,
  LoroText,
} from 'loro-crdt'
import { Plugin, PluginKey } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import { loroTreeSyncPluginKey } from './sync-plugin'
import {
  getTreeNodeIdForProseMirrorNode,
} from './tree-reconciliation'
import { TEXT_KEY } from './tree-schema'

export interface CursorUser {
  [key: string]: string
  color: string
  name: string
}

export interface CursorPresenceState {
  anchor?: Cursor
  focus?: Cursor
  topicId: string
  user?: CursorUser
}

interface CursorPresenceStore {
  getAll: () => Record<PeerID, CursorPresenceState>
  getLocal: () => CursorPresenceState | undefined
  setLocal: (state: Omit<CursorPresenceState, 'topicId'>) => void
  subscribe: (listener: (by: 'import' | 'local' | 'timeout') => void) => () => void
}

export interface CursorPluginOptions {
  createCursor?: (user: PeerID) => Element
  createSelection?: (user: PeerID) => DecorationAttrs
  getSelection?: (state: EditorState) => Selection
  user?: CursorUser
}

interface CursorEphemeralPayload {
  [key: string]: CursorUser | Uint8Array | string | null
  anchor: Uint8Array | null
  focus: Uint8Array | null
  topicId: string
  user: CursorUser | null
}

type CursorEphemeralStateMap = Record<string, CursorEphemeralPayload>

export class CursorEphemeralStore extends EphemeralStore<CursorEphemeralStateMap> {
  readonly #peer: PeerID
  readonly #topicId: string

  constructor(peer: PeerID, topicId: string, timeout?: number) {
    super(timeout)
    this.#peer = peer
    if (topicId.length === 0)
      throw new TypeError('Cursor presence Topic id must be a non-empty string')
    this.#topicId = topicId
  }

  setLocal(state: Omit<CursorPresenceState, 'topicId'>): void {
    if (!state.anchor && !state.focus && !state.user) {
      this.delete(this.#peer)
      return
    }
    this.set(this.#peer, {
      anchor: state.anchor?.encode() ?? null,
      focus: state.focus?.encode() ?? null,
      topicId: this.#topicId,
      user: state.user ?? null,
    })
  }

  getLocal(): CursorPresenceState | undefined {
    const state = this.get(this.#peer)
    if (!state)
      return undefined
    return {
      anchor: state.anchor ? Cursor.decode(state.anchor) : undefined,
      focus: state.focus ? Cursor.decode(state.focus) : undefined,
      topicId: state.topicId,
      user: state.user ?? undefined,
    }
  }

  getAll(): Record<PeerID, CursorPresenceState> {
    const result = {} as Record<PeerID, CursorPresenceState>
    for (const [peer, state] of Object.entries(this.getAllStates())) {
      if (!state)
        continue
      if (state.topicId !== this.#topicId)
        continue
      result[peer as PeerID] = {
        anchor: state.anchor ? Cursor.decode(state.anchor) : undefined,
        focus: state.focus ? Cursor.decode(state.focus) : undefined,
        topicId: state.topicId,
        user: state.user ?? undefined,
      }
    }
    return result
  }

  subscribeBy(listener: (by: 'import' | 'local' | 'timeout') => void): () => void {
    return super.subscribe(event => listener(event.by))
  }
}

function mappedIdForNode(state: LoroTreeSyncPluginState, node: ProseMirrorNode): string | undefined {
  const weakId = getTreeNodeIdForProseMirrorNode(node)
  if (weakId)
    return weakId
  for (const [id, mapped] of state.mapping) {
    if (mapped === node)
      return id
  }
  return undefined
}

function mappedSize(state: LoroTreeSyncPluginState, id: string): number {
  const mapped = state.mapping.get(id)
  if (Array.isArray(mapped))
    return mapped.reduce((size, node) => size + node.nodeSize, 0)
  return mapped?.nodeSize ?? 0
}

function absolutePositionToCursor(
  pmRootNode: ProseMirrorNode,
  position: number,
  state: LoroTreeSyncPluginState,
): Cursor | undefined {
  const resolved = pmRootNode.resolve(position)
  const parent = resolved.node(resolved.depth)
  const treeNodeId = mappedIdForNode(state, parent)
  const treeNode = treeNodeId ? state.tree.getNodeByID(treeNodeId as `${number}@${number}`) : undefined
  if (!treeNode)
    return undefined

  let remaining = resolved.parentOffset
  for (const child of treeNode.children() ?? []) {
    const text = child.data.get(TEXT_KEY)
    if (text instanceof LoroText) {
      const length = text.length
      if (remaining <= length)
        return text.getCursor(remaining)
      remaining -= length
    }
    else {
      const size = mappedSize(state, child.id)
      if (remaining <= size)
        return undefined
      remaining -= size
    }
  }
  return undefined
}

function contentStart(state: LoroTreeSyncPluginState, nodeId: string): number | undefined {
  const node = state.tree.getNodeByID(nodeId as `${number}@${number}`)
  if (!node)
    return undefined
  const parent = node.parent()
  if (!parent)
    return 0
  const parentStart = contentStart(state, parent.id)
  if (parentStart === undefined)
    return undefined
  const siblings = parent.children() ?? []
  let start = parentStart
  for (const sibling of siblings) {
    if (sibling.id === node.id)
      break
    start += mappedSize(state, sibling.id)
  }
  return start + 1
}

function treeNodeForText(state: LoroTreeSyncPluginState, containerId: ContainerID) {
  return state.tree.getNodes().find((node) => {
    const text = node.data.get(TEXT_KEY)
    return text instanceof LoroText && text.id === containerId
  })
}

export function cursorToAbsolutePosition(
  cursor: Cursor,
  state: LoroTreeSyncPluginState,
): [number, Cursor | undefined] {
  const position = state.doc.getCursorPos(cursor)
  if (!position)
    return [1, undefined]
  const textNode = treeNodeForText(state, cursor.containerId())
  const parent = textNode?.parent()
  if (!textNode || !parent)
    return [1, position.update]

  const parentStart = contentStart(state, parent.id)
  if (parentStart === undefined)
    return [1, position.update]
  let offset = parentStart
  for (const sibling of parent.children() ?? []) {
    if (sibling.id === textNode.id)
      break
    offset += mappedSize(state, sibling.id)
  }
  return [offset + position.offset, position.update]
}

export function convertPmSelectionToCursors(
  pmRootNode: ProseMirrorNode,
  selection: Selection,
  state: LoroTreeSyncPluginState,
) {
  const anchor = absolutePositionToCursor(pmRootNode, selection.anchor, state)
  const focus = selection.head === selection.anchor
    ? anchor
    : absolutePositionToCursor(pmRootNode, selection.head, state)
  return { anchor, focus }
}

export function cursorEq(left?: Cursor | null, right?: Cursor | null): boolean {
  if (!left && !right)
    return true
  if (!left || !right)
    return false
  const leftPosition = left.pos()
  const rightPosition = right.pos()
  return left.containerId() === right.containerId()
    && leftPosition?.counter === rightPosition?.counter
    && leftPosition?.peer === rightPosition?.peer
}

function createDecorations(
  state: EditorState,
  store: CursorPresenceStore,
  createSelection: (user: PeerID) => DecorationAttrs,
  createCursor: (user: PeerID) => Element,
): DecorationSet {
  const syncState = loroTreeSyncPluginKey.getState(state)
  if (!syncState)
    return DecorationSet.empty

  const decorations: Decoration[] = []
  for (const [peer, cursor] of Object.entries(store.getAll())) {
    if (peer === syncState.doc.peerIdStr || !cursor.anchor || !cursor.focus)
      continue
    const [anchor] = cursorToAbsolutePosition(cursor.anchor, syncState)
    const [focus] = cursorToAbsolutePosition(cursor.focus, syncState)
    decorations.push(Decoration.widget(focus, createCursor(peer as PeerID)))
    if (!cursorEq(cursor.anchor, cursor.focus)) {
      decorations.push(Decoration.inline(
        Math.min(anchor, focus),
        Math.max(anchor, focus),
        createSelection(peer as PeerID),
      ))
    }
  }
  return DecorationSet.create(state.doc, decorations)
}

function createCursorPlugin(store: CursorPresenceStore, options: CursorPluginOptions): Plugin<DecorationSet> {
  const key = new PluginKey<DecorationSet>('loro-tree-cursor')
  const getSelection = options.getSelection ?? (state => state.selection)
  const createSelection = options.createSelection ?? (user => ({
    'data-peer': user,
    'class': 'loro-selection',
    'style': 'background-color: rgba(228, 208, 102, 0.5)',
  }))
  const createCursor = options.createCursor ?? ((user) => {
    const userData = store.getAll()[user]
    const color = userData?.user?.color ?? user.slice(0, 6)
    const element = document.createElement('span')
    element.classList.add('ProseMirror-loro-cursor')
    element.style.borderColor = color
    const label = document.createElement('div')
    label.style.backgroundColor = color
    label.textContent = userData?.user?.name ?? user.slice(0, 6)
    element.append('\u2060', label, '\u2060')
    return element
  })

  return new Plugin<DecorationSet>({
    key,
    props: { decorations: state => key.getState(state) },
    state: {
      init: (_, state) => createDecorations(state, store, createSelection, createCursor),
      apply: (transaction, previous, _oldState, newState) => {
        const presenceUpdated = transaction.getMeta(key) as boolean | undefined
        const syncState = loroTreeSyncPluginKey.getState(newState)
        if (presenceUpdated || (syncState && syncState.changedBy !== 'local'))
          return createDecorations(newState, store, createSelection, createCursor)
        return previous.map(transaction.mapping, transaction.doc)
      },
    },
    view: (view) => {
      const updateCursor = () => {
        const syncState = loroTreeSyncPluginKey.getState(view.state)
        const current = store.getLocal()
        if (!syncState)
          return
        if (view.hasFocus()) {
          const { anchor, focus } = convertPmSelectionToCursors(view.state.doc, getSelection(view.state), syncState)
          if (!cursorEq(current?.anchor, anchor) || !cursorEq(current?.focus, focus))
            store.setLocal({ anchor, focus, user: options.user })
        }
        else if (current?.focus) {
          store.setLocal({})
        }
      }
      const unsubscribe = store.subscribe((origin) => {
        if (origin === 'local')
          return
        queueMicrotask(() => {
          if (!view.isDestroyed)
            view.dispatch(view.state.tr.setMeta(key, true))
        })
      })
      view.dom.addEventListener('focusin', updateCursor)
      view.dom.addEventListener('focusout', updateCursor)
      return {
        update: updateCursor,
        destroy: () => {
          view.dom.removeEventListener('focusin', updateCursor)
          view.dom.removeEventListener('focusout', updateCursor)
          unsubscribe()
          store.setLocal({})
        },
      }
    },
  })
}

export function LoroTreeEphemeralCursorPlugin(
  store: CursorEphemeralStore,
  options: CursorPluginOptions = {},
): Plugin<DecorationSet> {
  return createCursorPlugin({
    getAll: () => store.getAll(),
    getLocal: () => store.getLocal(),
    setLocal: state => store.setLocal(state),
    subscribe: listener => store.subscribeBy(listener),
  }, options)
}
