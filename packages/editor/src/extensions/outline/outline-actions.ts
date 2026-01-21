import type { Command, Editor } from '@tiptap/core'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { liftOutlineListItem, sinkOutlineListItem } from './outline-list-commands'
import {
  findAdjacentVisibleOutlineItemPos,
  findListItem,
  getOutlineItemSelection,
} from './outline-utils'

type Dispatch = ((tr: Transaction) => void) | undefined

interface KeyboardShortcutContext {
  editor: Editor
  view?: EditorView
}

function setFoldedState(
  state: EditorState,
  dispatch: Dispatch,
  folded: boolean,
) {
  const listItem = findListItem(state.selection.$from)
  if (!listItem)
    return false
  if (listItem.node.attrs.folded === folded)
    return false

  if (dispatch) {
    dispatch(
      state.tr.setNodeMarkup(listItem.pos, undefined, {
        ...listItem.node.attrs,
        folded,
      }),
    )
  }

  return true
}

function toggleFoldedState(state: EditorState, dispatch: Dispatch) {
  const listItem = findListItem(state.selection.$from)
  if (!listItem)
    return false

  const folded = !listItem.node.attrs.folded
  if (dispatch) {
    dispatch(
      state.tr.setNodeMarkup(listItem.pos, undefined, {
        ...listItem.node.attrs,
        folded,
      }),
    )
  }

  return true
}

function focusSiblingItem(direction: 'prev' | 'next'): Command {
  return ({ editor, state }) => {
    const listItem = findListItem(state.selection.$from)
    if (!listItem)
      return false

    const targetPos = findAdjacentVisibleOutlineItemPos(
      state,
      listItem.pos,
      direction === 'prev' ? -1 : 1,
    )
    if (targetPos === null)
      return false

    const selection = getOutlineItemSelection(state, targetPos)
    if (!selection) {
      return false
    }

    editor.view?.dispatch(state.tr.setSelection(selection).scrollIntoView())
    return true
  }
}

export const outlineCommands = {
  /**
   * Toggle the fold state of the current node
   */
  toggleFold:
    (): Command =>
      ({ state, dispatch }) => toggleFoldedState(state, dispatch),

  /**
   * Fold the current node
   */
  fold:
    (): Command =>
      ({ state, dispatch }) => setFoldedState(state, dispatch, true),

  /**
   * Unfold the current node
   */
  unfold:
    (): Command =>
      ({ state, dispatch }) => setFoldedState(state, dispatch, false),
  /**
   * Move to the previous list item
   */
  focusPreviousItem: () => focusSiblingItem('prev'),

  /**
   * Move to the next list item
   */
  focusNextItem: () => focusSiblingItem('next'),
}

export function outlineKeymap(_nodeTypeName: string) {
  return {
    'Tab': ({ editor }: KeyboardShortcutContext) => {
      if (editor.isActive('codeBlock')) {
        return false
      }
      if (isSelectionInTable(editor.state.selection.$from)) {
        return false
      }

      return sinkOutlineListItem(editor.state, editor.view?.dispatch)
    },

    'Shift-Tab': ({ editor }: KeyboardShortcutContext) => {
      if (editor.isActive('codeBlock')) {
        return false
      }
      if (isSelectionInTable(editor.state.selection.$from)) {
        return false
      }

      return liftOutlineListItem(editor.state, editor.view?.dispatch)
    },

    'Mod-[': ({ editor }: KeyboardShortcutContext) => {
      return editor.commands.fold()
    },

    'Mod-]': ({ editor }: KeyboardShortcutContext) => {
      return editor.commands.unfold()
    },

    'Mod-\\': ({ editor }: KeyboardShortcutContext) => {
      return editor.commands.toggleFold()
    },

    // ArrowUp/ArrowDown handled by outline navigation plugin to avoid keymap conflicts.
  }
}
