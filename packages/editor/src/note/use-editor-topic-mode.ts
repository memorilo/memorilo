import type { EditorModeValue } from '../common/editor-mode'
import type { EditorTopicDocument } from './editor-note'
import { useSyncExternalStore } from 'react'

export function useEditorTopicMode(topic: EditorTopicDocument): EditorModeValue {
  return useSyncExternalStore(topic.subscribe, topic.getMode, topic.getMode)
}
