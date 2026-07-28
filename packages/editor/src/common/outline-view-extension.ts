import type { ProseMirrorNode } from 'prosekit/pm/model'
import type { OutlineRuntime, OutlineRuntimeSnapshot } from './outline-runtime'
import { definePlugin } from 'prosekit/core'
import { Plugin, PluginKey } from 'prosekit/pm/state'

import { Decoration, DecorationSet } from 'prosekit/pm/view'

const outlineViewPluginKey = new PluginKey<number>('memorilo-outline-view')

function blockId(node: ProseMirrorNode): string {
  const value = node.attrs.blockId
  if (typeof value !== 'string' || value.length === 0)
    throw new Error('Outline view decorations require stable block IDs')
  return value
}

function focusPath(document: ProseMirrorNode, focusBlockId: string): Set<string> {
  let focusPosition: number | null = null
  document.descendants((node, position) => {
    if (node.type.name === 'list' && blockId(node) === focusBlockId) {
      focusPosition = position
      return false
    }
    return focusPosition === null
  })

  if (focusPosition === null)
    return new Set()

  const result = new Set<string>([focusBlockId])
  const resolved = document.resolve(focusPosition)
  for (let depth = 0; depth <= resolved.depth; depth += 1) {
    const node = resolved.node(depth)
    if (node.type.name === 'list')
      result.add(blockId(node))
  }
  return result
}

function ancestorBlockIds(document: ProseMirrorNode, position: number): Set<string> {
  const result = new Set<string>()
  const resolved = document.resolve(position)
  for (let depth = 0; depth <= resolved.depth; depth += 1) {
    const node = resolved.node(depth)
    if (node.type.name === 'list')
      result.add(blockId(node))
  }
  return result
}

function createDecorations(document: ProseMirrorNode, snapshot: OutlineRuntimeSnapshot): DecorationSet {
  if (!snapshot.active)
    return DecorationSet.empty

  const selected = new Set(snapshot.selectedBlockIds)
  const collapsed = new Set(snapshot.collapsedBlockIds)
  const path = snapshot.focusBlockId ? focusPath(document, snapshot.focusBlockId) : new Set<string>()
  const decorations: Decoration[] = []

  document.descendants((node, position) => {
    if (node.type.name !== 'list')
      return true

    const id = blockId(node)
    const attrs: Record<string, string> = {}
    if (selected.has(id))
      attrs['data-outline-selected'] = ''
    if (collapsed.has(id))
      attrs['data-outline-view-collapsed'] = ''

    if (snapshot.focusBlockId) {
      const isFocusRoot = id === snapshot.focusBlockId
      const isFocusAncestor = !isFocusRoot && path.has(id)
      const isFocusDescendant = ancestorBlockIds(document, position).has(snapshot.focusBlockId)
      if (isFocusRoot)
        attrs['data-outline-focus-root'] = ''
      else if (isFocusAncestor)
        attrs['data-outline-focus-ancestor'] = ''
      else if (!isFocusDescendant)
        attrs.hidden = ''
    }

    if (Object.keys(attrs).length > 0)
      decorations.push(Decoration.node(position, position + node.nodeSize, attrs))
    return true
  })

  return DecorationSet.create(document, decorations)
}

export function defineOutlineViewExtension(runtime: OutlineRuntime) {
  return definePlugin(new Plugin<number>({
    key: outlineViewPluginKey,
    state: {
      init: () => 0,
      apply: (transaction, revision) => transaction.getMeta(outlineViewPluginKey) ? revision + 1 : revision,
    },
    props: {
      decorations: (state) => {
        outlineViewPluginKey.getState(state)
        return createDecorations(state.doc, runtime.getSnapshot())
      },
    },
    view: (view) => {
      let updateQueued = false
      const unsubscribe = runtime.subscribe(() => {
        if (updateQueued)
          return
        updateQueued = true
        queueMicrotask(() => {
          updateQueued = false
          if (!view.isDestroyed)
            view.dispatch(view.state.tr.setMeta(outlineViewPluginKey, true))
        })
      })
      return { destroy: unsubscribe }
    },
  }))
}
