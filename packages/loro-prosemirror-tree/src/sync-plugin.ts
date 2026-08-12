import type { LoroEventBatch, Subscription } from 'loro-crdt'
import type { EditorState, StateField } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import type { TreeDocumentRuntime } from './tree-schema'
import { Fragment, Slice } from 'prosemirror-model'
import { Plugin, PluginKey, TextSelection } from 'prosemirror-state'
import { convertPmSelectionToCursors, cursorToAbsolutePosition } from './cursor'
import {
  createNodeFromLoroTree,
  getDocumentRoot,
} from './tree-document'
import {
  clearTreeMapping,
  updateLoroTreeFromPmState,
} from './tree-reconciliation'
import { loroTreeUndoPluginKey } from './undo-plugin'

export interface LoroTreeSyncPluginProps extends TreeDocumentRuntime {}

export interface LoroTreeSyncPluginState extends TreeDocumentRuntime {
  changedBy: 'checkout' | 'import' | 'local'
  subscription?: Subscription
}

type SyncMeta
  = | { type: 'doc-changed' }
    | { type: 'non-local-update' }
    | { state: Partial<LoroTreeSyncPluginState>, type: 'update-state' }

export const loroTreeSyncPluginKey = new PluginKey<LoroTreeSyncPluginState>('loro-tree-sync')

function safeSetSelection(view: EditorView, anchor: number, focus?: number): void {
  const size = view.state.doc.content.size
  if (anchor < 0 || anchor > size || (focus !== undefined && (focus < 0 || focus > size)))
    return
  const anchorPosition = view.state.doc.resolve(anchor)
  const focusPosition = focus === undefined ? anchorPosition : view.state.doc.resolve(focus)
  view.dispatch(view.state.tr.setSelection(TextSelection.between(anchorPosition, focusPosition)))
}

export function syncCursorsToPmSelection(
  view: EditorView,
  anchor: Parameters<typeof cursorToAbsolutePosition>[0],
  focus?: Parameters<typeof cursorToAbsolutePosition>[0],
): void {
  if (view.isDestroyed)
    return
  const state = loroTreeSyncPluginKey.getState(view.state)
  if (!state)
    return
  const [anchorPosition] = cursorToAbsolutePosition(anchor, state)
  const focusPosition = focus ? cursorToAbsolutePosition(focus, state)[0] : undefined
  safeSetSelection(view, anchorPosition, focusPosition)
}

function replaceFromTree(view: EditorView, state: LoroTreeSyncPluginState): void {
  if (!getDocumentRoot(state.tree))
    return
  const { anchor, focus } = convertPmSelectionToCursors(view.state.doc, view.state.selection, state)
  clearTreeMapping(state.mapping)
  const document = createNodeFromLoroTree(view.state.schema, state.tree, state.mapping)
  const transaction = view.state.tr.replace(
    0,
    view.state.doc.content.size,
    new Slice(Fragment.from(document), 0, 0),
  ).setMeta(loroTreeSyncPluginKey, { type: 'non-local-update' } satisfies SyncMeta)
  view.dispatch(transaction)
  if (anchor) {
    queueMicrotask(() => {
      syncCursorsToPmSelection(view, anchor, focus)
    })
  }
}

function onTreeEvent(view: EditorView, event: LoroEventBatch): void {
  if (view.isDestroyed)
    return
  const state = loroTreeSyncPluginKey.getState(view.state)
  if (!state)
    return
  state.changedBy = event.by
  if (event.by === 'local' && (event.origin === 'loroTreeSyncPlugin' || event.origin === 'sys:init'))
    return
  replaceFromTree(view, state)
}

function initializeView(view: EditorView): void {
  if (view.isDestroyed)
    return
  const state = loroTreeSyncPluginKey.getState(view.state)
  if (!state)
    return
  state.subscription?.()
  state.subscription = state.tree.subscribe(event => onTreeEvent(view, event))
  if (getDocumentRoot(state.tree))
    replaceFromTree(view, state)
}

export function LoroTreeSyncPlugin(props: LoroTreeSyncPluginProps): Plugin<LoroTreeSyncPluginState> {
  return new Plugin<LoroTreeSyncPluginState>({
    key: loroTreeSyncPluginKey,
    props: {
      editable: () => !props.doc.isDetached(),
    },
    state: {
      init: () => ({ ...props, changedBy: 'local' }),
      apply: (transaction, state, _oldState, newState) => {
        const meta = transaction.getMeta(loroTreeSyncPluginKey) as SyncMeta | undefined
        state.changedBy = meta?.type === 'non-local-update' ? 'import' : 'local'
        if (meta?.type === 'doc-changed') {
          const undoState = loroTreeUndoPluginKey.getState(newState)
          if (!undoState?.isUndoing.current)
            updateLoroTreeFromPmState(state.doc, state.tree, state.mapping, newState)
        }
        else if (meta?.type === 'update-state') {
          state = { ...state, ...meta.state }
        }
        return state
      },
    } as StateField<LoroTreeSyncPluginState>,
    appendTransaction: (transactions, _oldState, newState) => {
      if (!transactions.some(transaction => transaction.docChanged))
        return null
      if (transactions.some((transaction) => {
        const meta = transaction.getMeta(loroTreeSyncPluginKey) as SyncMeta | undefined
        return meta?.type === 'non-local-update'
      })) {
        return null
      }
      return newState.tr.setMeta(loroTreeSyncPluginKey, { type: 'doc-changed' } satisfies SyncMeta)
    },
    view: (view) => {
      const timer = setTimeout(() => initializeView(view), 0)
      return {
        destroy: () => {
          clearTimeout(timer)
          loroTreeSyncPluginKey.getState(view.state)?.subscription?.()
        },
      }
    },
  })
}

export function initializeLoroTree(
  state: EditorState,
  runtime: TreeDocumentRuntime,
): void {
  updateLoroTreeFromPmState(runtime.doc, runtime.tree, runtime.mapping, state)
}
