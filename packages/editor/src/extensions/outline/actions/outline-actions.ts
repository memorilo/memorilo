import type { Command, Editor } from '@tiptap/core'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import {
  findAdjacentVisibleOutlineItemPos,
  findListItem,
  getOutlineItemSelection,
  isImeComposing,
  isSelectionInTable,
} from '../core/outline-utils'
import { liftOutlineListItem, sinkOutlineListItem } from '../list/outline-list-commands'

type Dispatch = ((tr: Transaction) => void) | undefined

interface KeyboardShortcutContext {
  editor: Editor
  event?: KeyboardEvent
  view?: EditorView
}

function shouldSkipOutlineIndentation(editor: Editor) {
  // Avoid hijacking Tab indentation when editing code blocks or inside tables.
  return editor.isActive('codeBlock') || isSelectionInTable(editor.state.selection.$from)
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
    'Tab': ({ editor, event }: KeyboardShortcutContext) => {
      // Skip during IME composition to avoid committing preedit text into Yjs.
      if (isImeComposing(editor.view ?? undefined, event)) {
        return false
      }
      if (shouldSkipOutlineIndentation(editor)) {
        return false
      }
      return sinkOutlineListItem(editor.state, editor.view?.dispatch)
    },

    'Shift-Tab': ({ editor, event }: KeyboardShortcutContext) => {
      // Skip during IME composition to avoid committing preedit text into Yjs.
      if (isImeComposing(editor.view ?? undefined, event)) {
        return false
      }
      if (shouldSkipOutlineIndentation(editor)) {
        return false
      }

      return liftOutlineListItem(editor.state, editor.view?.dispatch)
    },

    'Mod-[': ({ editor, event }: KeyboardShortcutContext) => {
      // Skip during IME composition to avoid committing preedit text into Yjs.
      if (isImeComposing(editor.view ?? undefined, event)) {
        return false
      }
      return editor.commands.fold()
    },

    'Mod-]': ({ editor, event }: KeyboardShortcutContext) => {
      // Skip during IME composition to avoid committing preedit text into Yjs.
      if (isImeComposing(editor.view ?? undefined, event)) {
        return false
      }
      return editor.commands.unfold()
    },

    'Mod-\\': ({ editor, event }: KeyboardShortcutContext) => {
      // Skip during IME composition to avoid committing preedit text into Yjs.
      if (isImeComposing(editor.view ?? undefined, event)) {
        return false
      }
      return editor.commands.toggleFold()
    },

    // ArrowUp/ArrowDown handled by outline navigation plugin to avoid keymap conflicts.
  }
}
