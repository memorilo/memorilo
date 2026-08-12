import type { NodeJSON } from 'prosekit/core'
import type { EditorModeValue } from '../../src/common/editor-mode'
import type { EditorProps } from '../../src/editor'
import { useEffect, useState } from 'react'
import { EditorMode } from '../../src/common/editor-mode'
import { Editor } from '../../src/editor'
import { createEditorNote } from '../../src/note/editor-note'

export interface EditorTestHarnessProps extends Omit<EditorProps, 'topic'> {
  initialContent?: NodeJSON
  mode?: EditorModeValue
}

export function EditorTestHarness({ initialContent, mode = EditorMode.Document, ...editorProps }: EditorTestHarnessProps) {
  const [topic] = useState(() => {
    const note = createEditorNote({
      id: crypto.randomUUID(),
      initialTopic: { initialContent, mode, title: 'Test Topic' },
    })
    const [topicEntry] = note.getEntries()
    if (!topicEntry || topicEntry.kind !== 'topic')
      throw new Error('Editor test Note is missing its initial Topic')
    return note.getTopic(topicEntry.id)
  })

  useEffect(() => topic.setMode(mode), [mode, topic])
  return <Editor {...editorProps} topic={topic} />
}
