import type { JSONContent } from '@tiptap/core'
import type { FixtureEnvironment } from '../fixture-app-utils'
import Text from '@tiptap/extension-text'
import { useEditor } from '@tiptap/react'
import { useEffect, useMemo, useState } from 'react'
import MemoriloImage from '../../src/extensions/image/index'
import Outline from '../../src/extensions/outline'
import {
  createFullFixtureEnvironment,
  getFixtureEditorOptions,
  renderFixtureEditor,
} from '../fixture-app-utils'
import {
  clearImageFixtureCalls,
  getImageFixtureCalls,
  resetImageFixtureRuntime,
  seedImageFixtureAsset,
} from './runtime'

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

declare global {
  interface Window {
    __imageFixture?: {
      getJSON: () => JSONContent | null
      setContent: (content: JSONContent) => void
      getServiceCalls: () => ReturnType<typeof getImageFixtureCalls>
      clearServiceCalls: () => void
      seedAsset: (assetId: string, extension: string | null) => void
    }
  }
}

interface ImageFixtureAppProps {
  environment?: FixtureEnvironment
}

export function ImageFixtureApp({ environment = 'minimal' }: ImageFixtureAppProps) {
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
          MemoriloImage,
        ],
        content: initialContent,
      },
      'image-fixture-prosemirror',
    ),
    onCreate({ editor }) {
      setSnapshot(JSON.stringify(editor.getJSON(), null, 2))
    },
    onUpdate({ editor }) {
      setSnapshot(JSON.stringify(editor.getJSON(), null, 2))
    },
  }, [environment, fullEnvironment])

  useEffect(() => {
    resetImageFixtureRuntime()
  }, [])

  useEffect(() => {
    if (!editor) {
      delete window.__imageFixture
      return
    }

    window.__imageFixture = {
      getJSON: () => editor.getJSON(),
      setContent: (content: JSONContent) => {
        editor.commands.setContent(content)
      },
      getServiceCalls: () => getImageFixtureCalls(),
      clearServiceCalls: () => {
        clearImageFixtureCalls()
      },
      seedAsset: (assetId: string, extension: string | null) => {
        seedImageFixtureAsset(assetId, extension)
      },
    }

    return () => {
      delete window.__imageFixture
    }
  }, [editor])

  return (
    <main className="fixture-shell">
      <div className="fixture-grid">
        <section className="fixture-panel">
          <h1 className="fixture-label">Editor</h1>
          <div className="fixture-editor" data-testid="image-editor">
            {renderFixtureEditor(environment, fullEnvironment, editor)}
          </div>
        </section>

        <aside className="fixture-sidebar">
          <h2 className="fixture-label">JSON</h2>
          <pre className="fixture-pre" data-testid="image-json">
            {snapshot}
          </pre>
        </aside>
      </div>
    </main>
  )
}
