import type { Command, Editor } from '@tiptap/core'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { findListItem, findSiblingListItemPos, isOutlineTextBlockNode } from './outline-utils'

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

    const targetPos = findSiblingListItemPos(state, listItem, direction)
    if (targetPos === null)
      return false

    editor.commands.setTextSelection(targetPos + 1)
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

export function outlineKeymap(nodeTypeName: string) {
  return {
    'Tab': ({ editor }: KeyboardShortcutContext) => {
      editor.commands.sinkListItem(nodeTypeName)
      return true
    },

    'Shift-Tab': ({ editor }: KeyboardShortcutContext) => {
      return editor.commands.liftListItem(nodeTypeName)
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

    'ArrowUp': ({ editor, view }: KeyboardShortcutContext) => {
      if (!view)
        return false

      const { $from } = view.state.selection
      const parent = $from.parent

      if ($from.parentOffset === 0 && isOutlineTextBlockNode(parent)) {
        return editor.commands.focusPreviousItem()
      }

      return false
    },

    'ArrowDown': ({ editor, view }: KeyboardShortcutContext) => {
      if (!view)
        return false

      const { $from } = view.state.selection
      const parent = $from.parent

      if ($from.parentOffset === parent.content.size && isOutlineTextBlockNode(parent)) {
        return editor.commands.focusNextItem()
      }

      return false
    },
  }
}
