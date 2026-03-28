import type { NodePos } from '@tiptap/core'
import { Option } from 'effect'

export function getParentOutlineItem(nodePos: NodePos): Option.Option<NodePos> {
  let node = nodePos.parent
  while (node && !node.node.type.isInGroup('outlineItem')) {
    node = node.parent
  }
  return Option.fromNullable(node)
}

export function getParentOutlineList(nodePos: NodePos): Option.Option<NodePos> {
  let node = nodePos.parent
  while (node && !node.node.type.isInGroup('outlineList')) {
    node = node.parent
  }
  return Option.fromNullable(node)
}

export function getParentBlock(nodePos: NodePos): Option.Option<NodePos> {
  let node: NodePos | null = nodePos
  while (node && !node.node.isBlock) {
    node = node.parent
  }
  return Option.fromNullable(node)
}
