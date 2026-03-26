import type { JSONContent } from '@tiptap/core'
import { Editor as TiptapEditor } from '@tiptap/core'
import { useMemo, useSyncExternalStore } from 'react'
import { Doc } from 'yjs'
import { createMemoriloEditorOptions, MemoriloEditor } from '../../src/editor'

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
                  text: 'Alpha Beta',
                },
              ],
            },
          ],
        },
      ],
    },
  ],
}

function seedBubbleFixtureFragment() {
  const doc = new Doc()
  const fragment = doc.getXmlFragment('doc')
  const seedEditor = new TiptapEditor({
    element: document.createElement('div'),
    ...createMemoriloEditorOptions(fragment),
    content: initialContent,
  })

  seedEditor.commands.setContent(initialContent)
  seedEditor.destroy()

  return fragment
}

function formatSnapshot(value: unknown) {
  const snapshot = JSON.stringify(value, null, 2)
  if (snapshot == null) {
    throw new TypeError('Bubble fixture snapshot is unavailable')
  }

  return snapshot
}

export function BubbleFixtureApp() {
  const fragment = useMemo(() => seedBubbleFixtureFragment(), [])
  const snapshot = useSyncExternalStore((onStoreChange) => {
    const handleChange = () => onStoreChange()
    fragment.observeDeep(handleChange)
    return () => fragment.unobserveDeep(handleChange)
  }, () => formatSnapshot(fragment.toJSON()))

  return (
    <main className="fixture-shell">
      <div className="fixture-grid">
        <section className="fixture-panel">
          <h1 className="fixture-label">Editor</h1>
          <div className="fixture-editor" data-testid="bubble-editor">
            <MemoriloEditor fragment={fragment} />
          </div>
        </section>

        <aside className="fixture-sidebar">
          <h2 className="fixture-label">Yjs JSON</h2>
          <pre className="fixture-pre" data-testid="bubble-json">
            {snapshot}
          </pre>
        </aside>
      </div>
    </main>
  )
}
