import type { Cursor, UndoManager as LoroUndoManager } from 'loro-crdt'
import type { Command, EditorState, StateField } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import { UndoManager } from 'loro-crdt'
import { Plugin, PluginKey } from 'prosemirror-state'
import { convertPmSelectionToCursors } from './cursor'
import { loroTreeSyncPluginKey, syncCursorsToPmSelection } from './sync-plugin'

export interface LoroTreeUndoPluginProps {
  doc: ConstructorParameters<typeof UndoManager>[0]
  manageSelection?: boolean
  undoManager?: LoroUndoManager
}

export interface LoroTreeUndoPluginState {
  canRedo: boolean
  canUndo: boolean
  isUndoing: { current: boolean }
  undoManager: LoroUndoManager
}

export const loroTreeUndoPluginKey = new PluginKey<LoroTreeUndoPluginState>('loro-tree-undo')

export function LoroTreeUndoPlugin(props: LoroTreeUndoPluginProps): Plugin<LoroTreeUndoPluginState> {
  const undoManager = props.undoManager ?? new UndoManager(props.doc, {})
  const manageSelection = props.manageSelection ?? props.undoManager === undefined
  let lastSelection: { anchor: Cursor | null, focus: Cursor | null } = { anchor: null, focus: null }

  return new Plugin<LoroTreeUndoPluginState>({
    key: loroTreeUndoPluginKey,
    state: {
      init: () => {
        undoManager.addExcludeOriginPrefix('sys:init')
        return {
          canRedo: undoManager.canRedo(),
          canUndo: undoManager.canUndo(),
          isUndoing: { current: false },
          undoManager,
        }
      },
      apply: (_transaction, state, oldState) => {
        const syncState = loroTreeSyncPluginKey.getState(oldState)
        if (syncState) {
          const selection = convertPmSelectionToCursors(oldState.doc, oldState.selection, syncState)
          lastSelection = {
            anchor: selection.anchor ?? null,
            focus: selection.focus ?? null,
          }
        }
        return {
          ...state,
          canRedo: undoManager.canRedo(),
          canUndo: undoManager.canUndo(),
        }
      },
    } as StateField<LoroTreeUndoPluginState>,
    view: (view: EditorView) => {
      if (!manageSelection)
        return {}
      undoManager.setOnPush((isUndo) => {
        let selection = lastSelection
        if (!isUndo) {
          const syncState = loroTreeSyncPluginKey.getState(view.state)
          if (syncState) {
            const current = convertPmSelectionToCursors(view.state.doc, view.state.selection, syncState)
            selection = { anchor: current.anchor ?? null, focus: current.focus ?? null }
          }
        }
        return {
          cursors: [selection.anchor, selection.focus].filter((cursor): cursor is Cursor => cursor !== null),
          value: null,
        }
      })
      undoManager.setOnPop((_isUndo, meta) => {
        const anchor = meta.cursors[0]
        if (!anchor)
          return
        queueMicrotask(() => syncCursorsToPmSelection(view, anchor, meta.cursors[1]))
      })
      return {
        destroy: () => {
          undoManager.setOnPop()
          undoManager.setOnPush()
        },
      }
    },
  })
}

export function canUndo(state: EditorState): boolean {
  return loroTreeUndoPluginKey.getState(state)?.undoManager.canUndo() ?? false
}

export function canRedo(state: EditorState): boolean {
  return loroTreeUndoPluginKey.getState(state)?.undoManager.canRedo() ?? false
}

export const undo: Command = (state, dispatch) => {
  const undoState = loroTreeUndoPluginKey.getState(state)
  if (!undoState)
    return false
  if (!dispatch)
    return undoState.undoManager.canUndo()
  undoState.isUndoing.current = true
  queueMicrotask(() => {
    undoState.isUndoing.current = false
  })
  return undoState.undoManager.undo()
}

export const redo: Command = (state, dispatch) => {
  const undoState = loroTreeUndoPluginKey.getState(state)
  if (!undoState)
    return false
  if (!dispatch)
    return undoState.undoManager.canRedo()
  undoState.isUndoing.current = true
  queueMicrotask(() => {
    undoState.isUndoing.current = false
  })
  return undoState.undoManager.redo()
}
