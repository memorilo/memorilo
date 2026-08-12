import type { LoroTreeNodeMapping } from '@memorilo/loro-prosemirror-tree/document'
import type { EditorTopicDocument } from './editor-note'
import { CursorEphemeralStore } from '@memorilo/loro-prosemirror-tree'
import { resolveEditorTopicBinding } from './editor-note'

export interface EditorTopicRuntime extends ReturnType<typeof resolveEditorTopicBinding> {
  mapping: LoroTreeNodeMapping
  presence: CursorEphemeralStore
}

export function resolveEditorTopicDocument(document: EditorTopicDocument): EditorTopicRuntime {
  const binding = resolveEditorTopicBinding(document)
  return {
    ...binding,
    mapping: new Map(),
    presence: new CursorEphemeralStore(binding.doc.peerIdStr, binding.topicId),
  }
}
