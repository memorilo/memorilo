import type { EditorState } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { findListItem, getOutlineItemSelection, isOutlineTextBlockNode, isSelectionInTable } from '../core/outline-utils'

// IME preedit helper: keep composition text inside a real textblock in outline items.
// Without this, IME preedit can attach to the NodeView wrapper, producing span/br nodes
// and syncing the preedit (pinyin) instead of the committed CJK text.
// Zero-width space used as a temporary IME anchor inside an empty textblock.
const PLACEHOLDER_CHAR = '\u200B'

function resolveOutlineTextblockSelection(state: EditorState) {
  const { selection } = state
  if (selection instanceof TextSelection && isOutlineTextBlockNode(selection.$from.parent)) {
    return selection
  }

  const listItem = findListItem(selection.$from)
  if (!listItem) {
    return null
  }

  const nextSelection = getOutlineItemSelection(state, listItem.pos)
  if (!nextSelection || !(nextSelection instanceof TextSelection)) {
    return null
  }
  if (!isOutlineTextBlockNode(nextSelection.$from.parent)) {
    return null
  }
  return nextSelection
}

function insertPlaceholderIfEmpty(view: EditorView) {
  const { state } = view
  const selection = resolveOutlineTextblockSelection(state)
  if (!selection) {
    return false
  }
  if (isSelectionInTable(selection.$from)) {
    return false
  }

  const text = selection.$from.parent.textContent ?? ''
  if (text.length > 0 && text !== PLACEHOLDER_CHAR) {
    return false
  }
  if (text === PLACEHOLDER_CHAR) {
    return false
  }

  // Insert a placeholder so IME preedit stays inside the textblock instead of NodeView wrapper.
  const tr = state.tr.insertText(PLACEHOLDER_CHAR, selection.from)
  tr.setSelection(TextSelection.near(tr.doc.resolve(selection.from + 1), 1))
  view.dispatch(tr)
  return true
}

function stripLeadingPlaceholder(view: EditorView) {
  const { state } = view
  const selection = resolveOutlineTextblockSelection(state)
  if (!selection) {
    return false
  }
  if (isSelectionInTable(selection.$from)) {
    return false
  }

  const { $from } = selection
  const start = $from.start()
  const firstChar = state.doc.textBetween(start, start + 1, undefined, '\uFFFC')
  if (firstChar !== PLACEHOLDER_CHAR) {
    return false
  }

  const text = $from.parent.textContent ?? ''
  if (text.length <= 1) {
    return false
  }

  const tr = state.tr.delete(start, start + 1)
  view.dispatch(tr)
  return true
}

export function createOutlineImePreeditPlugin() {
  return new Plugin({
    key: new PluginKey('outlineImePreedit'),
    props: {
      handleDOMEvents: {
        compositionstart: (view) => {
          // Ensure IME preedit is anchored inside a real textblock.
          insertPlaceholderIfEmpty(view)
          return false
        },
        compositionend: (view) => {
          // Remove the placeholder once real text has been committed.
          stripLeadingPlaceholder(view)
          return false
        },
      },
    },
  })
}
