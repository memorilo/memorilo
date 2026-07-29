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
    const note = createEditorNote({ id: crypto.randomUUID() })
    const topicId = note.createTopic({ initialContent, mode, title: 'Test Topic' })
    return note.bindTopic(topicId)
  })

  useEffect(() => topic.setMode(mode), [mode, topic])
  return <Editor {...editorProps} topic={topic} />
}
