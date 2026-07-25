export const editorCapabilities = [
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
  'context-menu',
  'block-dragging',
] as const

export type EditorCapability = typeof editorCapabilities[number]
