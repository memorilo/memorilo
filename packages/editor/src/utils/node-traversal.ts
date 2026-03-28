import type { Node as PMNode, ResolvedPos } from '@tiptap/pm/model'

export interface AncestorMatch {
  depth: number
  node: PMNode
  pos: number
}

export function getParentNodeDepth($pos: ResolvedPos, nodeName: string): number | null {
  for (let depth = $pos.depth; depth >= 0; depth -= 1) {
    if ($pos.node(depth).type.name === nodeName) {
      return depth
    }
  }

  return null
}

export function findClosestAncestor(
  $pos: ResolvedPos,
  predicate: (node: PMNode) => boolean,
): AncestorMatch | null {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth)
    if (predicate(node)) {
      return {
        depth,
        node,
        pos: $pos.before(depth),
      }
    }
  }

  return null
}

export function findClosestAncestorInclusive(
  $pos: ResolvedPos,
  predicate: (node: PMNode) => boolean,
): AncestorMatch | null {
  for (let depth = $pos.depth; depth >= 0; depth -= 1) {
    const node = $pos.node(depth)
    if (predicate(node)) {
      return {
        depth,
        node,
        pos: depth === 0 ? 0 : $pos.before(depth),
      }
    }
  }

  return null
}
