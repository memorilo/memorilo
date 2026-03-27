import type { JSONContent } from '@tiptap/core'
import type { FixtureEnvironment } from '../fixture-app-utils'
import Text from '@tiptap/extension-text'
import { useEditor } from '@tiptap/react'
import { useEffect, useMemo, useState } from 'react'
import Mathematics from '../../src/extensions/mathematics'
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
  ],
}

declare global {
  interface Window {
    __mathFixture?: {
      getJSON: () => JSONContent | null
      setContent: (content: JSONContent) => void
      getSelection: () => {
        from: number
        to: number
        empty: boolean
        parentType: string
        parentOffset: number
        ancestorTypes: string[]
        blockType: string | null
        blockText: string
      } | null
    }
  }
}

interface MathFixtureAppProps {
  environment?: FixtureEnvironment
}

export function MathFixtureApp({ environment = 'minimal' }: MathFixtureAppProps) {
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
          Mathematics,
        ],
        content: initialContent,
      },
      'math-fixture-prosemirror',
    ),
    onCreate({ editor }) {
      setSnapshot(JSON.stringify(editor.getJSON(), null, 2))
    },
    onUpdate({ editor }) {
      setSnapshot(JSON.stringify(editor.getJSON(), null, 2))
    },
  }, [environment, fullEnvironment])

  useEffect(() => {
    if (!editor) {
      delete window.__mathFixture
      return
    }

    window.__mathFixture = {
      getJSON: () => editor.getJSON(),
      setContent: (content: JSONContent) => {
        editor.commands.setContent(content)
      },
      getSelection: () => {
        const { selection } = editor.state
        const { $from } = selection

        let blockType: string | null = null
        let blockText = ''

        for (let depth = $from.depth; depth >= 0; depth -= 1) {
          const node = $from.node(depth)
          if (!node.isBlock) {
            continue
          }

          blockType = node.type.name
          blockText = node.textContent
          break
        }

        return {
          from: selection.from,
          to: selection.to,
          empty: selection.empty,
          parentType: $from.parent.type.name,
          parentOffset: $from.parentOffset,
          ancestorTypes: Array.from({ length: $from.depth + 1 }, (_, index) => $from.node(index).type.name),
          blockType,
          blockText,
        }
      },
    }

    return () => {
      delete window.__mathFixture
    }
  }, [editor])

  return (
    <main className="fixture-shell">
      <div className="fixture-grid">
        <section className="fixture-panel">
          <h1 className="fixture-label">Editor</h1>
          <div className="fixture-editor" data-testid="math-editor">
            {renderFixtureEditor(environment, fullEnvironment, editor)}
          </div>
        </section>

        <aside className="fixture-sidebar">
          <h2 className="fixture-label">JSON</h2>
          <pre className="fixture-pre" data-testid="math-json">
            {snapshot}
          </pre>
        </aside>
      </div>
    </main>
  )
}
