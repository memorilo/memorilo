import type { ProseMirrorNode } from 'prosekit/pm/model'
import type { EditorView } from 'prosekit/pm/view'
import type { OutlineRuntime } from '../common/outline-runtime'
import { defineDOMEventHandler, union } from 'prosekit/core'
import { defineDropIndicator } from 'prosekit/extensions/drop-indicator'
import { NodeSelection } from 'prosekit/pm/state'

interface DropBoundary {
  distance: number
  position: number
}

interface DropTarget {
  node: ProseMirrorNode
  parent: ProseMirrorNode
}

function elementRectAt(view: EditorView, position: number): DOMRect {
  const element = view.nodeDOM(position)
  if (!(element instanceof HTMLElement))
    throw new Error(`Document drop boundary ${position} has no rendered block element`)
  return element.getBoundingClientRect()
}

function blockAtDropTarget(view: EditorView, event: DragEvent): DropTarget | null {
  const eventTarget = event.target
  if (!(eventTarget instanceof Element))
    return null

  const targetElement = eventTarget.closest<HTMLElement>('[data-block-id]')
  if (!targetElement)
    return { node: view.state.doc, parent: view.state.doc }

  const targetBlockId = targetElement.dataset.blockId
  if (!targetBlockId)
    throw new Error('Document drop target is missing its stable id')

  let target: DropTarget | null = null
  view.state.doc.descendants((node, _position, parent) => {
    if (node.attrs.blockId !== targetBlockId)
      return true
    if (!parent)
      throw new Error(`Document drop target ${targetBlockId} has no parent`)
    target = { node, parent }
    return false
  })
  if (!target)
    throw new Error(`Document drop target ${targetBlockId} is missing from the editor document`)
  return target
}

function rejectDrop(view: EditorView, event: DragEvent): true {
  event.preventDefault()
  view.dragging = null
  return true
}

function nearestSameParentBoundary(view: EditorView, source: NodeSelection, event: DragEvent): number | null {
  const parent = source.$from.parent
  const parentStart = source.$from.start(source.$from.depth)
  const childPositions: number[] = []
  let childPosition = parentStart
  parent.forEach((child) => {
    childPositions.push(childPosition)
    childPosition += child.nodeSize
  })

  const boundaries: DropBoundary[] = []
  for (let index = 0; index <= parent.childCount; index += 1) {
    if (!parent.canReplaceWith(index, index, source.node.type, source.node.marks))
      continue

    const indexedPosition = childPositions[index]
    const previousPosition = childPositions[index - 1]
    const position = index < parent.childCount ? indexedPosition : childPosition
    const rectPosition = index < parent.childCount ? indexedPosition : previousPosition
    if (position === undefined || rectPosition === undefined)
      throw new Error(`Document drop boundary ${index} is missing its child position`)
    if (source.from <= position && position <= source.to)
      continue

    const rect = elementRectAt(view, rectPosition)
    const y = index < parent.childCount ? rect.top : rect.bottom
    const horizontalDistance = event.clientX < rect.left
      ? rect.left - event.clientX
      : event.clientX > rect.right
        ? event.clientX - rect.right
        : 0
    boundaries.push({
      distance: Math.abs(event.clientY - y) + horizontalDistance,
      position,
    })
  }

  boundaries.sort((left, right) => left.distance - right.distance || left.position - right.position)
  return boundaries[0]?.position ?? null
}

function moveWithinCurrentParent(view: EditorView, source: NodeSelection, event: DragEvent): boolean {
  event.preventDefault()
  const targetPosition = nearestSameParentBoundary(view, source, event)
  view.dragging = null
  if (targetPosition === null)
    return true

  const transaction = view.state.tr
  source.replace(transaction)
  const mappedPosition = transaction.mapping.map(targetPosition)
  transaction.replaceRangeWith(mappedPosition, mappedPosition, source.node)
  transaction.setSelection(NodeSelection.create(transaction.doc, mappedPosition))
  view.focus()
  view.dispatch(transaction.setMeta('uiEvent', 'drop'))
  return true
}

export function defineDocumentDropExtension(runtime: OutlineRuntime) {
  return union(
    defineDropIndicator({
      onDrag: ({ pos, view }) => {
        if (runtime.getSnapshot().active)
          return true

        const source = view.state.selection
        if (!(source instanceof NodeSelection))
          return true

        return source.$from.parent === view.state.doc.resolve(pos).parent
      },
    }),
    defineDOMEventHandler('drop', (view, event) => {
      if (runtime.getSnapshot().active)
        return false

      const dragging = view.dragging
      const source = view.state.selection
      if (!dragging || !(source instanceof NodeSelection))
        return false

      const target = blockAtDropTarget(view, event)
      if (!target || target.node === source.node || target.parent !== source.$from.parent)
        return rejectDrop(view, event)

      return moveWithinCurrentParent(view, source, event)
    }),
  )
}
