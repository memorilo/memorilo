import type { EditorModeValue } from '../common/editor-mode'
import type { EditorTopicDocument } from './editor-note'
import { useSyncExternalStore } from 'react'
import { EditorMode } from '../common/editor-mode'

const subscribeWithoutTopic = () => () => undefined
const documentModeWithoutTopic = () => EditorMode.Document

export function useEditorTopicMode(topic: EditorTopicDocument | null): EditorModeValue {
  return useSyncExternalStore(
    topic?.subscribe ?? subscribeWithoutTopic,
    topic?.getMode ?? documentModeWithoutTopic,
    topic?.getMode ?? documentModeWithoutTopic,
  )
}
