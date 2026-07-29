export const EditorMode = {
  Document: 0,
  Outline: 1,
} as const

export type EditorModeValue = typeof EditorMode[keyof typeof EditorMode]

export type EditorModeName = 'document' | 'outline'

export function assertEditorMode(value: unknown, description = 'Editor mode'): EditorModeValue {
  if (value !== EditorMode.Document && value !== EditorMode.Outline)
    throw new TypeError(`${description} must be ${EditorMode.Document} (Document) or ${EditorMode.Outline} (Outline)`)
  return value
}

export function editorModeName(mode: EditorModeValue): EditorModeName {
  if (mode === EditorMode.Document)
    return 'document'
  if (mode === EditorMode.Outline)
    return 'outline'
  throw new TypeError(`Unknown Editor mode: ${String(mode)}`)
}
