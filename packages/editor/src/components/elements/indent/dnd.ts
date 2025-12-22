import type { IndentDropPosition } from './contexts'
import { cloneDeep } from 'es-toolkit'
import { Editor, Node, Path, Element as SlateElement, Transforms } from 'slate'
import { ReactEditor } from 'slate-react'
import { isIndent } from '../../../lib/element-type'

const INDENT_GUTTER_PX = 48

export function getDropPosition(clientX: number, clientY: number, containerRect: DOMRect, anchorRect: DOMRect): IndentDropPosition {
  const inGutter = clientX <= containerRect.left + INDENT_GUTTER_PX
  if (!inGutter)
    return 'inside'

  const midY = anchorRect.top + anchorRect.height / 2
  return clientY < midY ? 'before' : 'after'
}

function getSlateNodeFromDom(editor: Editor, domNode: globalThis.Node | null) {
  let current: globalThis.Node | null = domNode
  while (current) {
    try {
      return ReactEditor.toSlateNode(editor as any, current as any)
    }
    catch {
      current = current.parentNode
    }
  }
  return null
}

export function pickIndentTargetFromPoint(editor: Editor, clientX: number, clientY: number) {
  const probe = (x: number) => {
    const dom = document.elementFromPoint(x, clientY)
    if (!dom)
      return null

    const slateNode = getSlateNodeFromDom(editor, dom)
    if (!slateNode)
      return null

    let at: Path
    try {
      at = ReactEditor.findPath(editor as any, slateNode as any)
    }
    catch {
      return null
    }

    const indentEntry = Editor.above(editor, {
      at,
      match: n => isIndent(n),
      mode: 'lowest',
    })
    if (!indentEntry)
      return null

    const [indentNode, indentPath] = indentEntry
    if (!SlateElement.isElement(indentNode))
      return null

    let containerDomNode: HTMLElement
    try {
      containerDomNode = ReactEditor.toDOMNode(editor as any, indentNode as any)
    }
    catch {
      return null
    }

    const containerRect = containerDomNode.getBoundingClientRect()

    let anchorRect = containerRect
    try {
      const headerNode = Node.get(editor, indentPath.concat(0))
      if (SlateElement.isElement(headerNode)) {
        const headerDomNode = ReactEditor.toDOMNode(editor as any, headerNode as any) as HTMLElement
        anchorRect = headerDomNode.getBoundingClientRect()
      }
    }
    catch {}

    return { indentNode, indentPath, containerRect, anchorRect }
  }

  const direct = probe(clientX)
  const shifted = probe(clientX + INDENT_GUTTER_PX)

  if (direct && shifted) {
    if (Path.isAncestor(direct.indentPath, shifted.indentPath))
      return shifted
    if (shifted.indentPath.length > direct.indentPath.length)
      return shifted
    return direct
  }

  return shifted ?? direct
}

function computeDestination(
  editor: Editor,
  sourcePath: Path,
  targetPath: Path,
  position: IndentDropPosition,
) {
  if (targetPath.length === 0 || sourcePath.length === 0)
    return null

  if (Path.isAncestor(sourcePath, targetPath) || Path.equals(sourcePath, targetPath)) {
    return null
  }

  if (position === 'inside') {
    const targetNode = Node.get(editor, targetPath)
    if (!SlateElement.isElement(targetNode))
      return null
    const rawParent = targetPath
    const rawIndex = Math.max(1, targetNode.children.length)
    if (Path.equals(rawParent, sourcePath) || Path.isAncestor(sourcePath, rawParent))
      return null
    return { rawParent, rawIndex }
  }

  const rawParent = Path.parent(targetPath)
  const targetIndex = targetPath[targetPath.length - 1]
  if (targetIndex === undefined)
    return null
  const rawIndex = targetIndex + (position === 'after' ? 1 : 0)
  if (Path.equals(rawParent, sourcePath) || Path.isAncestor(sourcePath, rawParent))
    return null
  return { rawParent, rawIndex }
}

export function moveIndentSubtree(
  editor: Editor,
  sourcePath: Path,
  targetPath: Path,
  position: IndentDropPosition,
) {
  const destination = computeDestination(editor, sourcePath, targetPath, position)
  if (!destination)
    return false

  let node: Node
  try {
    node = Node.get(editor, sourcePath)
  }
  catch {
    return false
  }

  const nodeClone = cloneDeep(node)
  const removeOp = { type: 'remove_node', path: sourcePath, node } as any

  Editor.withoutNormalizing(editor, () => {
    Transforms.removeNodes(editor, { at: sourcePath })

    const transformedParent = Path.transform(destination.rawParent, removeOp)
    if (!transformedParent)
      return

    let insertIndex = destination.rawIndex
    const sourceParent = Path.parent(sourcePath)
    const sourceIndex = sourcePath[sourcePath.length - 1]
    if (sourceIndex !== undefined && Path.equals(transformedParent, sourceParent) && sourceIndex < insertIndex) {
      insertIndex -= 1
    }

    if (insertIndex < 0)
      insertIndex = 0

    const parentNodeAfter = transformedParent.length === 0 ? editor : Node.get(editor, transformedParent)
    if (SlateElement.isElement(parentNodeAfter) && (parentNodeAfter as any).type === 'indent') {
      insertIndex = Math.max(1, insertIndex)
    }

    const insertPath = transformedParent.concat(insertIndex)
    Transforms.insertNodes(editor, nodeClone as any, { at: insertPath })
    try {
      Transforms.select(editor, Editor.start(editor, insertPath))
    }
    catch {}
  })

  return true
}
