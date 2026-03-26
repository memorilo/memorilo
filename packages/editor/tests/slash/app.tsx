import type { JSONContent } from '@tiptap/core'
import { Editor as TiptapEditor } from '@tiptap/core'
import { EditorContent, useEditor } from '@tiptap/react'
import { useMemo, useSyncExternalStore } from 'react'
import { Doc } from 'yjs'
import { createMemoriloEditorOptions } from '../../src/editor'
import { YjsDocumentContext } from '../../src/provider/yjs'

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

function seedSlashFixtureFragment() {
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
    throw new TypeError('Slash fixture snapshot is unavailable')
  }

  return snapshot
}

export function SlashFixtureApp() {
  const fragment = useMemo(() => seedSlashFixtureFragment(), [])
  const editorOptions = useMemo(() => createMemoriloEditorOptions(fragment), [fragment])
  const editor = useEditor(editorOptions, [editorOptions])
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
          <div className="fixture-editor" data-testid="slash-editor">
            <YjsDocumentContext value={{ fragment }}>
              <div className="memorilo-editor px-8 py-4 [&_.ProseMirror]:outline-none">
                <EditorContent editor={editor} />
              </div>
            </YjsDocumentContext>
          </div>
        </section>

        <aside className="fixture-sidebar">
          <h2 className="fixture-label">Yjs JSON</h2>
          <pre className="fixture-pre" data-testid="slash-json">
            {snapshot}
          </pre>
        </aside>
      </div>
    </main>
  )
}
