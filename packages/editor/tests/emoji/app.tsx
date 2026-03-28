import type { JSONContent } from '@tiptap/core'
import type { FixtureEnvironment } from '../fixture-app-utils'
import Text from '@tiptap/extension-text'
import { useEditor } from '@tiptap/react'
import { useMemo, useState } from 'react'
import { Emoji } from '../../src/extensions/emoji'
import Outline from '../../src/extensions/outline'
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

interface EmojiFixtureAppProps {
  environment?: FixtureEnvironment
}

export function EmojiFixtureApp({ environment = 'minimal' }: EmojiFixtureAppProps) {
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
          Emoji,
        ],
        content: initialContent,
      },
      'emoji-fixture-prosemirror',
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
          <div className="fixture-editor" data-testid="emoji-editor">
            {renderFixtureEditor(environment, fullEnvironment, editor)}
          </div>
        </section>

        <aside className="fixture-sidebar">
          <h2 className="fixture-label">JSON</h2>
          <pre className="fixture-pre" data-testid="emoji-json">
            {snapshot}
          </pre>
        </aside>
      </div>
    </main>
  )
}
