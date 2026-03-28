import type { JSONContent } from '@tiptap/core'
import { Editor as TiptapEditor } from '@tiptap/core'
import { useCallback, useMemo, useState } from 'react'
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

function createFixtureFragment() {
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

export function OutlineClickFixtureApp() {
  const fragment = useMemo(() => createFixtureFragment(), [])
  const [clickedId, setClickedId] = useState('none')
  const [useSecondHandler, setUseSecondHandler] = useState(false)
  const handleOutlineClick = useCallback((id: string) => {
    setClickedId(`${useSecondHandler ? 'second' : 'first'}:${id}`)
  }, [useSecondHandler])

  return (
    <main className="fixture-shell">
      <div className="fixture-grid">
        <section className="fixture-panel">
          <h1 className="fixture-label">Outline Click Editor</h1>
          <button
            type="button"
            className="fixture-button"
            onClick={() => setUseSecondHandler(true)}
          >
            Use second handler
          </button>
          <div className="fixture-editor" data-testid="outline-click-editor">
            <MemoriloEditor
              fragment={fragment}
              onOutlineClick={handleOutlineClick}
            />
          </div>
        </section>

        <aside className="fixture-sidebar">
          <h2 className="fixture-label">Clicked ID</h2>
          <pre className="fixture-pre" data-testid="outline-clicked-id">{clickedId}</pre>
        </aside>
      </div>
    </main>
  )
}
