import type { EditorView } from '@tiptap/pm/view'
import { NodeSelection, Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { slashSuggestionPluginKey } from '../../slash/slash-plugin-key'
import {
  findAdjacentVisibleOutlineItemPos,
  findListItem,
  getOutlineItemEndSelection,
  getOutlineItemSelection,
  isListContainerNode,
  isOutlineItemNode,
  isOutlineTextBlockNode,
  isSelectionInTable,
} from '../core/outline-utils'

interface ArrowIntent {
  direction: -1 | 1
  useEndSelection: boolean
  axis: 'up' | 'down' | 'left'
}

function getArrowIntent(event: KeyboardEvent): ArrowIntent | null {
  if (event.key === 'ArrowUp' || event.key === 'Up') {
    return { direction: -1, useEndSelection: false, axis: 'up' }
  }

  if (event.key === 'ArrowDown' || event.key === 'Down') {
    return { direction: 1, useEndSelection: false, axis: 'down' }
  }

  if (event.key === 'ArrowLeft') {
    return { direction: -1, useEndSelection: true, axis: 'left' }
  }

  return null
}

function isSlashSuggestionActive(view: EditorView) {
  const slashState = slashSuggestionPluginKey.getState(view.state)
  if (slashState?.active) {
    return true
  }

  const { selection } = view.state
  const domAtPos = view.domAtPos(selection.from)
  const node = domAtPos.node
  const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element | null)
  if (!element) {
    return false
  }

  return Boolean(element.closest('.slash-suggestion'))
}

function getListItemChildIndex(
  listItem: ReturnType<typeof findListItem>,
  pos: number,
) {
  if (!listItem) {
    return null
  }

  const posInListItem = pos - (listItem.pos + 1)
  if (posInListItem < 0 || posInListItem > listItem.node.content.size) {
    return null
  }

  let offset = 0
  for (let index = 0; index < listItem.node.childCount; index += 1) {
    const child = listItem.node.child(index)
    const end = offset + child.nodeSize
    if (posInListItem < end) {
      return index
    }
    offset = end
  }
  if (posInListItem === listItem.node.content.size && listItem.node.childCount > 0) {
    return listItem.node.childCount - 1
  }
  return null
}

function isSelectionAtItemEdge(
  view: EditorView,
  selection: TextSelection,
  listItem: ReturnType<typeof findListItem>,
  intent: ArrowIntent,
) {
  if (!listItem || !selection.empty) {
    return false
  }

  const { $from } = selection
  if (!$from.parent.isTextblock || !isOutlineTextBlockNode($from.parent)) {
    return false
  }
  const childIndex = getListItemChildIndex(listItem, $from.pos)
  if (childIndex === null) {
    return false
  }

  if (intent.axis === 'left') {
    return childIndex === 0 && $from.parentOffset === 0
  }

  if (intent.axis === 'up') {
    return childIndex === 0
  }

  if (!view.endOfTextblock(intent.axis)) {
    return false
  }

  if (childIndex < listItem.node.childCount - 1) {
    const nextChild = listItem.node.child(childIndex + 1)
    return isListContainerNode(nextChild)
  }

  return true
}

export function createOutlineNavigationPlugin() {
  return new Plugin({
    key: new PluginKey('outlineNavigation'),
    props: {
      handleKeyDown: (view, event) => {
        if (isSlashSuggestionActive(view)) {
          return false
        }

        const intent = getArrowIntent(event)
        if (!intent) {
          return false
        }

        const { direction, useEndSelection } = intent
        const { state } = view
        const { selection } = state
        if (selection instanceof TextSelection && isSelectionInTable(selection.$from)) {
          return false
        }

        let listItemPos: number | null = null
        let shouldHandle = selection instanceof NodeSelection

        if (selection instanceof NodeSelection) {
          if (!isOutlineItemNode(selection.node)) {
            return false
          }
          listItemPos = selection.from
        }
        else if (selection instanceof TextSelection) {
          const { $from } = selection
          const listItem = findListItem($from)
          if (!listItem) {
            return false
          }
          if (!isSelectionAtItemEdge(view, selection, listItem, intent)) {
            return false
          }
          listItemPos = listItem.pos
          shouldHandle = true
        }

        if (!shouldHandle || listItemPos === null) {
          return false
        }

        const targetPos = findAdjacentVisibleOutlineItemPos(state, listItemPos, direction)
        if (targetPos === null) {
          return false
        }

        const nextSelection = useEndSelection
          ? getOutlineItemEndSelection(state, targetPos)
          : getOutlineItemSelection(state, targetPos)
        if (!nextSelection) {
          return false
        }

        event.preventDefault()
        view.dispatch(state.tr.setSelection(nextSelection).scrollIntoView())
        return true
      },
    },
  })
}
