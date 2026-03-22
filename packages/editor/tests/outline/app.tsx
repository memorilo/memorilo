import type { JSONContent } from '@tiptap/core'
import Heading from '@tiptap/extension-heading'
import Text from '@tiptap/extension-text'
import { EditorContent, useEditor } from '@tiptap/react'
import { useState } from 'react'
import Outline from '../../src/extensions/outline'

const initialContent: JSONContent = {
  type: 'doc',
  content: [
    {
      type: 'outlineUList',
      content: [
        {
          type: 'outlineUordItem',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'Alpha',
                },
              ],
            },
          ],
        },
      ],
    },
  ],
}

export function OutlineFixtureApp() {
  const [snapshot, setSnapshot] = useState(() => JSON.stringify(initialContent, null, 2))

  const editor = useEditor({
    extensions: [
      Text,
      Heading,
      Outline,
    ],
    content: initialContent,
    onCreate({ editor }) {
      setSnapshot(JSON.stringify(editor.getJSON(), null, 2))
    },
    onUpdate({ editor }) {
      setSnapshot(JSON.stringify(editor.getJSON(), null, 2))
    },
    editorProps: {
      attributes: {
        class: 'outline-fixture-prosemirror',
      },
    },
  })

  return (
    <main className="fixture-shell">
      <div className="fixture-grid">
        <section className="fixture-panel">
          <h1 className="fixture-label">Editor</h1>
          <div className="fixture-editor" data-testid="outline-editor">
            <EditorContent editor={editor} />
          </div>
        </section>

        <aside className="fixture-sidebar">
          <h2 className="fixture-label">JSON</h2>
          <pre className="fixture-pre" data-testid="outline-json">
            {snapshot}
          </pre>
        </aside>
      </div>
    </main>
  )
}
