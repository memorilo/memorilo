import type { EditorOptions, JSONContent } from '@tiptap/core'
import type { XmlFragment } from 'yjs'
import { Editor as TiptapEditor } from '@tiptap/core'
import { useEditor } from '@tiptap/react'
import { yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap'
import { useMemo, useState, useSyncExternalStore } from 'react'
import { Doc, XmlElement } from 'yjs'
import { createMemoriloEditorOptions, MemoriloEditorBody } from '../../src/editor'

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
                      text: 'Beta',
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: 'outlineOrdList',
          content: [
            {
              type: 'outlineOrdItem',
              attrs: {
                number: 1,
              },
              content: [
                {
                  type: 'paragraph',
                  content: [
                    {
                      type: 'text',
                      text: 'One',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
}

type OutlineSubtreeVariant = 'unordered' | 'ordered'

interface OutlineSubtreeEnvironment {
  rootFragment: XmlFragment
  subtreeFragment: XmlElement
  editorOptions: Partial<EditorOptions>
}

function resolveVariant(): OutlineSubtreeVariant {
  const params = new URLSearchParams(window.location.search)
  const variant = params.get('root')
  if (variant === 'unordered' || variant === 'ordered') {
    return variant
  }

  return 'unordered'
}

function createOutlineSubtreeEnvironment(variant: OutlineSubtreeVariant): OutlineSubtreeEnvironment {
  const doc = new Doc()
  const rootFragment = doc.getXmlFragment('doc')
  const seedEditor = new TiptapEditor({
    element: document.createElement('div'),
    ...createMemoriloEditorOptions(rootFragment),
    content: initialContent,
  })

  seedEditor.commands.setContent(initialContent)
  seedEditor.destroy()

  const topLevelRoot = rootFragment.get(0)
  if (!(topLevelRoot instanceof XmlElement)) {
    throw new TypeError('Expected top-level outline root to be a Y.XmlElement')
  }
  const subtreeIndex = variant === 'unordered' ? 1 : 2
  const subtreeFragment = topLevelRoot.get(subtreeIndex)
  if (!(subtreeFragment instanceof XmlElement)) {
    throw new TypeError(`Expected subtree root at index ${subtreeIndex} to be a Y.XmlElement`)
  }

  return {
    rootFragment,
    subtreeFragment,
    editorOptions: createMemoriloEditorOptions(subtreeFragment),
  }
}

export function OutlineSubtreeFixtureApp() {
  const variant = useMemo(() => resolveVariant(), [])
  const environment = useMemo(() => createOutlineSubtreeEnvironment(variant), [variant])
  const [editorSnapshot, setEditorSnapshot] = useState<string>('null')

  const editor = useEditor({
    ...environment.editorOptions,
    onCreate({ editor }) {
      setEditorSnapshot(JSON.stringify(editor.getJSON(), null, 2))
    },
    onUpdate({ editor }) {
      setEditorSnapshot(JSON.stringify(editor.getJSON(), null, 2))
    },
  }, [environment])

  const hostSnapshot = useSyncExternalStore((onStoreChange) => {
    const handleChange = () => onStoreChange()
    environment.rootFragment.observeDeep(handleChange)
    return () => environment.rootFragment.unobserveDeep(handleChange)
  }, () => JSON.stringify(yXmlFragmentToProsemirrorJSON(environment.rootFragment), null, 2))

  return (
    <main className="fixture-shell">
      <div className="fixture-grid">
        <section className="fixture-panel">
          <h1 className="fixture-label">Subtree Editor</h1>
          <div className="fixture-editor" data-testid="outline-subtree-editor">
            <div className="memorilo-editor px-8 py-4 [&_.ProseMirror]:outline-none">
              <MemoriloEditorBody editor={editor} fragment={environment.subtreeFragment} />
            </div>
          </div>
        </section>

        <aside className="fixture-sidebar">
          <h2 className="fixture-label">Editor JSON</h2>
          <pre className="fixture-pre" data-testid="outline-subtree-editor-json">
            {editorSnapshot}
          </pre>
          <h2 className="fixture-label">Host JSON</h2>
          <pre className="fixture-pre" data-testid="outline-subtree-host-json">
            {hostSnapshot}
          </pre>
        </aside>
      </div>
    </main>
  )
}
