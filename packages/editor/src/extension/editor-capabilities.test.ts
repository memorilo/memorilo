import { describe, expect, it } from 'vitest'

import { editorCapabilities } from './editor-capabilities'

describe('editorCapabilities', () => {
  it('tracks the extensible full-editor feature surface', () => {
    expect(editorCapabilities).toEqual([
      'formatting',
      'lists',
      'tables',
      'block-handles',
      'table-handles',
      'slash-menu',
      'mentions',
      'image-upload',
      'image-resize',
      'code-blocks',
      'mermaid',
      'math',
      'inline-menu',
      'block-dragging',
    ])
  })
})
