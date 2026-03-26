import type { JSONContent } from '@tiptap/core'
import type { FixtureEnvironment } from '../fixture-app-utils'
import Text from '@tiptap/extension-text'
import { useEditor } from '@tiptap/react'
import { useMemo, useState } from 'react'
import Outline from '../../src/extensions/outline'
import { Table } from '../../src/extensions/table'
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
            },
          ],
        },
      ],
    },
  ],
}

interface TableFixtureAppProps {
  environment?: FixtureEnvironment
}

export function TableFixtureApp({ environment = 'minimal' }: TableFixtureAppProps) {
  const fullEnvironment = useMemo(() => createFullFixtureEnvironment(), [])
  const [snapshot, setSnapshot] = useState(() => JSON.stringify(initialContent, null, 2))

  const editor = useEditor({
    ...getFixtureEditorOptions(
      environment,
      fullEnvironment,
      {
        extensions: [
          Text,
          Outline,
          Table,
        ],
        content: initialContent,
      },
      'table-fixture-prosemirror',
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
          <div className="fixture-editor" data-testid="table-editor">
            {renderFixtureEditor(environment, fullEnvironment, editor)}
          </div>
        </section>

        <aside className="fixture-sidebar">
          <h2 className="fixture-label">JSON</h2>
          <pre className="fixture-pre" data-testid="table-json">
            {snapshot}
          </pre>
        </aside>
      </div>
    </main>
  )
}
