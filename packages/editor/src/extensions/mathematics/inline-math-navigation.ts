import type { EditorView } from '@tiptap/pm/view'
import { EditorState, Selection, TextSelection, Transaction } from '@tiptap/pm/state'

function findVerticalCaretTarget(view: EditorView, pos: number, dir: -1 | 1) {
  const coords = view.coordsAtPos(pos)
  const x = (coords.left + coords.right) / 2
  const lineHeight = Math.max(1, coords.bottom - coords.top)
  const probeOffsets = [
    Math.max(8, lineHeight * 0.75),
    Math.max(12, lineHeight * 1.5),
    Math.max(16, lineHeight * 2.25),
  ]

  for (const offset of probeOffsets) {
    const target = view.posAtCoords({
      left: x,
      top: dir < 0 ? coords.top - offset : coords.bottom + offset,
    })
    if (target && target.pos !== pos) {
      return target.pos
    }
  }

  return null
}

function textblockContainsNodeType(
  selection: TextSelection,
  name: string,
) {
  const textblockDepth = findTextblockDepth(selection.$from)
  if (!textblockDepth) {
    return false
  }

  let contains = false
  selection.$from.node(textblockDepth).descendants((node) => {
    if (node.type.name === name) {
      contains = true
      return false
    }
    return true
  })

  return contains
}

function findTextblockDepth(pos: TextSelection['$from']) {
  for (let depth = pos.depth; depth > 0; depth -= 1) {
    if (pos.node(depth).isTextblock) {
      return depth
    }
  }

  return null
}

function getTextblockBoundaryPos(pos: TextSelection['$from'], dir: -1 | 1) {
  const textblockDepth = findTextblockDepth(pos)
  if (!textblockDepth) {
    return null
  }

  return dir < 0
    ? pos.before(textblockDepth)
    : pos.after(textblockDepth)
}

function isSelectionInSameTextblock(
  currentSelection: TextSelection,
  nextSelection: Selection,
) {
  const currentDepth = findTextblockDepth(currentSelection.$from)
  const nextDepth = findTextblockDepth(nextSelection.$from)
  if (!currentDepth || !nextDepth) {
    return false
  }

  return currentSelection.$from.start(currentDepth) === nextSelection.$from.start(nextDepth)
}

function findSelectionOutsideCurrentTextblock(
  selection: TextSelection,
  startPos: number,
  dir: -1 | 1,
) {
  const seen = new Set<number>()
  let probePos = startPos

  while (!seen.has(probePos)) {
    seen.add(probePos)

    const $probe = selection.$from.doc.resolve(probePos)
    const nextSelection = Selection.findFrom($probe, dir, true)
      ?? Selection.findFrom($probe, dir)

    if (!nextSelection) {
      return null
    }

    if (!isSelectionInSameTextblock(selection, nextSelection)) {
      return nextSelection
    }

    if (!(nextSelection instanceof TextSelection)) {
      return nextSelection
    }

    const nextProbePos = getTextblockBoundaryPos(nextSelection.$from, dir)
    if (nextProbePos === null) {
      return null
    }

    probePos = nextProbePos
  }

  return null
}

function getVerticalTextblockTraversalSelection(
  selection: TextSelection,
  pos: TextSelection['$from'],
  dir: -1 | 1,
) {
  const triedBoundaries = new Set<number>()

  for (let depth = pos.depth; depth > 0; depth -= 1) {
    const boundaryPos = dir < 0 ? pos.before(depth) : pos.after(depth)
    if (triedBoundaries.has(boundaryPos)) {
      continue
    }

    triedBoundaries.add(boundaryPos)

    const traversalSelection = findSelectionOutsideCurrentTextblock(selection, boundaryPos, dir)
    if (traversalSelection) {
      return traversalSelection
    }
  }

  const textblockBoundaryPos = getTextblockBoundaryPos(pos, dir)
  if (textblockBoundaryPos === null || triedBoundaries.has(textblockBoundaryPos)) {
    return null
  }

  return findSelectionOutsideCurrentTextblock(selection, textblockBoundaryPos, dir)
}

export function moveInlineMathCaretVertically(
  state: EditorState,
  tr: Transaction,
  dispatch: EditorView['dispatch'] | undefined,
  view: EditorView,
  name: string,
  dir: -1 | 1,
) {
  const { selection } = state
  if (!(selection instanceof TextSelection) || !selection.empty) {
    return false
  }

  const $cursor = selection.$cursor
  if (!$cursor || $cursor.parent.type.name !== name || $cursor.depth === 0) {
    const traversalSelection = getVerticalTextblockTraversalSelection(selection, selection.$from, dir)
    if (!traversalSelection || !textblockContainsNodeType(selection, name)) {
      return false
    }

    tr.setSelection(traversalSelection)
    if (dispatch) {
      dispatch(tr)
    }
    return true
  }

  let nextSelection: Selection | null = null
  nextSelection = getVerticalTextblockTraversalSelection(selection, $cursor, dir)

  if (!nextSelection) {
    const targetPos = findVerticalCaretTarget(view, selection.head, dir)
    if (targetPos === null) {
      const edge = dir < 0 ? selection.$from : selection.$to
      if (view.endOfTextblock(dir < 0 ? 'up' : 'down', state)) {
        nextSelection = Selection.findFrom(edge, dir, true)
          ?? Selection.findFrom(edge, dir)
      }
    }
    else {
      nextSelection = TextSelection.near(state.doc.resolve(targetPos), dir)
    }
  }

  if (
    !nextSelection
    || (nextSelection.from === selection.from && nextSelection.to === selection.to)
    || isSelectionInSameTextblock(selection, nextSelection)
  ) {
    nextSelection = getVerticalTextblockTraversalSelection(selection, $cursor, dir)
      ?? (
        (() => {
          const boundaryPos = dir < 0 ? $cursor.before() : $cursor.after()
          return findSelectionOutsideCurrentTextblock(selection, boundaryPos, dir)
            ?? Selection.findFrom(state.doc.resolve(boundaryPos), dir, true)
            ?? Selection.findFrom(state.doc.resolve(boundaryPos), dir)
            ?? TextSelection.near(state.doc.resolve(boundaryPos), dir)
        })()
      )
  }

  if (!nextSelection) {
    return true
  }

  tr.setSelection(nextSelection)
  if (dispatch) {
    dispatch(tr)
  }
  return true
}
