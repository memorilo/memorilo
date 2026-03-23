import type { JSONContent } from '@tiptap/core'
import Heading from '@tiptap/extension-heading'
import Text from '@tiptap/extension-text'
import { useEditor } from '@tiptap/react'
import { useMemo, useState } from 'react'
import Outline from '../../src/extensions/outline'
import type { FixtureEnvironment } from '../fixture-app-utils'
import {
  createFullFixtureEnvironment,
  getFixtureEditorOptions,
  renderFixtureEditor,
} from '../fixture-app-utils'

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

interface OutlineFixtureAppProps {
  environment?: FixtureEnvironment
}

export function OutlineFixtureApp({ environment = 'minimal' }: OutlineFixtureAppProps) {
  const fullEnvironment = useMemo(() => createFullFixtureEnvironment(), [])
  const [snapshot, setSnapshot] = useState(() => JSON.stringify(initialContent, null, 2))

  const editor = useEditor({
    ...getFixtureEditorOptions(
      environment,
      fullEnvironment,
      {
        extensions: [
          Text,
          Heading,
          Outline,
        ],
        content: initialContent,
      },
      'outline-fixture-prosemirror',
    ),
    onCreate({ editor }) {
      setSnapshot(JSON.stringify(editor.getJSON(), null, 2))
    },
    onUpdate({ editor }) {
      setSnapshot(JSON.stringify(editor.getJSON(), null, 2))
    },
  }, [environment, fullEnvironment])

  return (
    <main className="fixture-shell">
      <div className="fixture-grid">
        <section className="fixture-panel">
          <h1 className="fixture-label">Editor</h1>
          <div className="fixture-editor" data-testid="outline-editor">
            {renderFixtureEditor(environment, fullEnvironment, editor)}
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
