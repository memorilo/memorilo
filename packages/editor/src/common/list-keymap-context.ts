import type { Node as ProseMirrorNode } from 'prosekit/pm/model'
import type { EditorState } from 'prosekit/pm/state'
import { isListNode } from 'prosemirror-flat-list'

export interface ListBlockContext {
  depth: number
  hasPreviousSiblingBlock: boolean
  kind: unknown
  nested: boolean
  node: ProseMirrorNode
  position: number
  previousSiblingKind: unknown
}

export function currentListBlockContext(state: EditorState): ListBlockContext | null {
  const { $from } = state.selection
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth)
    if (!isListNode(node))
      continue

    const parent = $from.node(depth - 1)
    const index = $from.index(depth - 1)
    const previousSibling = index > 0 ? parent.child(index - 1) : null
    return {
      depth,
      hasPreviousSiblingBlock: previousSibling !== null
        && isListNode(previousSibling)
        && typeof previousSibling.attrs.kind === 'string',
      kind: node.attrs.kind,
      nested: isListNode(parent),
      node,
      position: $from.before(depth),
      previousSiblingKind: previousSibling?.attrs.kind,
    }
  }
  return null
}
