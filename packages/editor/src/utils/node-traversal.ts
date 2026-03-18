import type { ResolvedPos } from '@tiptap/pm/model'

export function getParentNodeDepth($pos: ResolvedPos, nodeName: string): number | null {
  for (let depth = $pos.depth; depth >= 0; depth -= 1) {
    if ($pos.node(depth).type.name === nodeName) {
      return depth
    }
  }

  return null
}
