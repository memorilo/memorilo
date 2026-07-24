import { createStore } from 'jotai'

export function createEditorStore() {
  return createStore()
}

export type EditorStore = ReturnType<typeof createEditorStore>
