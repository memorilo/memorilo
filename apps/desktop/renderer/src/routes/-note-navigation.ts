import type { DesktopNote } from '@memorilo/desktop-preload'
import { createEditorNote } from '@memorilo/editor/note'

export function defaultTopicId(stored: DesktopNote): string {
  const note = createEditorNote({
    id: stored.id,
    snapshot: stored.snapshot,
    title: stored.title,
  })
  const topic = note.getEntries().find(entry => entry.kind === 'topic')
  if (!topic)
    throw new Error(`Note ${stored.id} does not contain a Topic`)
  return topic.id
}
