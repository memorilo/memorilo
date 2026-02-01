import type { EditorState } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { GapCursor } from '@tiptap/pm/gapcursor'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import {
  findListItem,
  findSiblingListItemPos,
  isImeComposing,
  isOutlineItemName,
  isOutlineMediaNode,
  isSelectionInTable,
} from '../core/outline-utils'

function getOutlineMediaGapPos(state: EditorState) {
  const { $from } = state.selection
  if (!isSelectionInTable($from)) {
    return null
  }

  const listItem = findListItem($from)
  if (!listItem) {
    return null
  }
  const firstChild = listItem.node.firstChild
  if (!firstChild) {
    return null
  }
  if (!isOutlineMediaNode(firstChild)) {
    return null
  }

  return listItem.pos + 1
}

function isOutlineMediaGapSelection(state: EditorState) {
  const { selection } = state
  if (!(selection instanceof GapCursor)) {
    return false
  }

  const { $from } = selection
  if (!isOutlineItemName($from.parent.type.name)) {
    return false
  }
  if ($from.parentOffset !== 0) {
    return false
  }

  const firstChild = $from.parent.firstChild
  if (!firstChild) {
    return false
  }
  return isOutlineMediaNode(firstChild)
}

function isTableSelectionAtEdge(state: EditorState) {
  if (!(state.selection instanceof TextSelection)) {
    return false
  }
  const { $from } = state.selection
  if (!$from.parent.isTextblock) {
    return false
  }
  return $from.parentOffset === 0
}

function moveFromMediaGapSelection(view: EditorView, direction: 'up' | 'left') {
  const listItem = findListItem(view.state.selection.$from)
  if (!listItem) {
    return false
  }

  const prevPos = findSiblingListItemPos(view.state, listItem, 'prev')
  const resolveSelection = direction === 'up' ? getOutlineItemStartSelection : getOutlineItemEndSelection
  if (prevPos !== null) {
    const nextSelection = resolveSelection(view.state, prevPos)
    if (nextSelection) {
      view.dispatch(view.state.tr.setSelection(nextSelection).scrollIntoView())
      return true
    }
  }

  // If there is no previous sibling, move to the parent list position to preserve outline navigation flow.
  const listDepth = listItem.depth - 1
  if (listDepth > 0) {
    const listPos = view.state.selection.$from.before(listDepth)
    const nextSelection = TextSelection.near(view.state.doc.resolve(listPos), -1)
    view.dispatch(view.state.tr.setSelection(nextSelection).scrollIntoView())
    return true
  }

  return false
}

function getOutlineItemStartSelection(state: EditorState, listItemPos: number) {
  const listItem = state.doc.nodeAt(listItemPos)
  if (!listItem) {
    return null
  }

  const startPos = listItemPos + 1
  const firstChild = listItem.firstChild
  if (firstChild && isOutlineMediaNode(firstChild)) {
    return new GapCursor(state.doc.resolve(startPos))
  }

  return TextSelection.near(state.doc.resolve(startPos), 1)
}

function getOutlineItemEndSelection(state: EditorState, listItemPos: number) {
  const listItem = state.doc.nodeAt(listItemPos)
  if (!listItem) {
    return null
  }

  const endPos = listItemPos + listItem.nodeSize - 1
  const selection = TextSelection.near(state.doc.resolve(endPos), -1)
  const selectionItem = findListItem(selection.$from)
  if (!selectionItem || selectionItem.pos !== listItemPos) {
    return getOutlineItemStartSelection(state, listItemPos)
  }

  if (isSelectionInTable(selection.$from)) {
    return getOutlineItemStartSelection(state, listItemPos)
  }

  return selection
}

export function createOutlineTableGapPlugin() {
  let isComposing = false
  return new Plugin({
    key: new PluginKey('outlineTableGap'),
    appendTransaction: (_transactions, _oldState, newState) => {
      if (isComposing) {
        // IME composition can transiently create gap selections; avoid syncing preedit state.
        return null
      }
      if (!(newState.selection instanceof GapCursor)) {
        return null
      }
      if (isOutlineMediaGapSelection(newState)) {
        return null
      }

      // Hide gap cursors outside of outline media gaps to avoid stray caret positions.
      const { $from } = newState.selection
      const nodeAfter = $from.nodeAfter
      if (nodeAfter && isOutlineItemName(nodeAfter.type.name)) {
        const nextSelection = getOutlineItemStartSelection(newState, $from.pos)
        if (nextSelection) {
          return newState.tr.setSelection(nextSelection)
        }
      }
      const nodeBefore = $from.nodeBefore
      if (nodeBefore && isOutlineItemName(nodeBefore.type.name)) {
        const nextSelection = getOutlineItemEndSelection(newState, $from.pos - nodeBefore.nodeSize)
        if (nextSelection) {
          return newState.tr.setSelection(nextSelection)
        }
      }
      return newState.tr.setSelection(TextSelection.near($from, 1))
    },
    props: {
      handleDOMEvents: {
        compositionstart: () => {
          isComposing = true
          return false
        },
        compositionend: () => {
          isComposing = false
          return false
        },
      },
      handleTextInput: (view) => {
        // IME composition should not be intercepted; let the editor commit text first.
        if (isImeComposing(view)) {
          return false
        }
        // Prevent inserting text before leading media so Tab/Shift-Tab can adjust outline depth.
        return isOutlineMediaGapSelection(view.state)
      },
      handlePaste: (view) => {
        return isOutlineMediaGapSelection(view.state)
      },
      handleKeyDown: (view, event) => {
        // IME composition emits keydown with preedit text; skip handling to avoid syncing pinyin.
        if (isImeComposing(view, event)) {
          return false
        }
        if ((event.key === 'ArrowLeft' || event.key === 'ArrowUp') && isTableSelectionAtEdge(view.state)) {
          const gapPos = getOutlineMediaGapPos(view.state)
          if (gapPos !== null) {
            const $gap = view.state.doc.resolve(gapPos)
            view.dispatch(view.state.tr.setSelection(new GapCursor($gap)).scrollIntoView())
            return true
          }
        }
        if (!isOutlineMediaGapSelection(view.state)) {
          return false
        }
        if (event.key === 'ArrowUp') {
          const handled = moveFromMediaGapSelection(view, 'up')
          if (handled) {
            event.preventDefault()
          }
          return handled
        }
        if (event.key === 'ArrowLeft') {
          const handled = moveFromMediaGapSelection(view, 'left')
          if (handled) {
            event.preventDefault()
          }
          return handled
        }
        if (event.key === 'Enter' || event.key === 'Backspace' || event.key === 'Delete') {
          event.preventDefault()
          return true
        }
        return false
      },
    },
  })
}
