import type { Extension } from 'prosekit/core'
import type { EditorTag } from '../adapters/editor-adapters'
import { defineNodeSpec } from 'prosekit/core'
import { getTagLabelError } from '../tag/tag-label'

export interface TagAttrs extends EditorTag {}

export type TagSpecExtension = Extension<{
  Nodes: {
    tag: TagAttrs
  }
}>

export function defineTagSpec(): TagSpecExtension {
  return defineNodeSpec<'tag', TagAttrs>({
    name: 'tag',
    atom: true,
    group: 'inline',
    attrs: {
      id: { validate: 'string' },
      label: { validate: 'string' },
    },
    inline: true,
    leafText: node => `#${(node.attrs as TagAttrs).label}`,
    parseDOM: [{
      tag: 'span[data-tag]',
      getAttrs: (dom) => {
        const id = dom.getAttribute('data-id')
        const label = dom.getAttribute('data-tag')
        if (!id || !label || getTagLabelError(label))
          return false
        return { id, label } satisfies TagAttrs
      },
    }],
    toDOM(node) {
      const attrs = node.attrs as TagAttrs
      return ['span', { 'data-id': attrs.id, 'data-tag': attrs.label }, `#${attrs.label}`]
    },
  })
}
