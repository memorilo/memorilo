import type { ErrorInfo, JSONContent, ReactNode } from 'react'
import { Editor as TiptapEditor } from '@tiptap/core'
import { CellSelection } from '@tiptap/pm/tables'
import { EditorContent, useEditor } from '@tiptap/react'
import { Component, useEffect, useMemo, useState } from 'react'
import { Doc } from 'yjs'
import { createMemoriloEditorOptions } from '../../src/editor'
import { EditorBubbleMenu } from '../../src/extensions/bubble-menu'
import { getTableContext } from '../../src/extensions/bubble-menu/table-menu-utils'

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

declare global {
  interface Window {
    __bubbleFixture?: {
      getJSON: () => JSONContent | null
      selectTableCells: (anchorRow: number, anchorCol: number, headRow: number, headCol: number) => void
      mergeSelectedCells: () => boolean
      focusTableCell: (row: number, col: number) => boolean
      readSelectionState: () => {
        empty: boolean
        from: number
        to: number
        type: string
        anchorCellPos: number | null
        headCellPos: number | null
        canMergeCells: boolean
        canSplitCell: boolean
      }
      renderError: {
        message: string
        stack: string | null
        componentStack: string | null
      } | null
    }
  }
}

interface BubbleMenuErrorBoundaryProps {
  children: ReactNode
}

class BubbleMenuErrorBoundary extends Component<BubbleMenuErrorBoundaryProps> {
  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Bubble fixture menu render error', error, errorInfo.componentStack)
    if (!window.__bubbleFixture) {
      return
    }

    window.__bubbleFixture.renderError = {
      message: error.message,
      stack: error.stack ?? null,
      componentStack: errorInfo.componentStack,
    }
  }

  override render() {
    return this.props.children
  }
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

function requireTableContext(editor: TiptapEditor) {
  const context = getTableContext(editor.state)
  if (!context) {
    throw new Error('Bubble fixture table context is unavailable')
  }

  return context
}

function getTableCellPos(editor: TiptapEditor, row: number, col: number) {
  const context = requireTableContext(editor)
  if (row < 0 || row >= context.rows) {
    throw new RangeError(`Table row ${row} is out of bounds for ${context.rows} rows`)
  }
  if (col < 0 || col >= context.cols) {
    throw new RangeError(`Table column ${col} is out of bounds for ${context.cols} columns`)
  }

  return context.tablePos + 1 + context.map.positionAt(row, col, context.tableNode)
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
  const [snapshot, setSnapshot] = useState(() => formatSnapshot(fragment.toJSON()))
  const editorOptions = useMemo(() => createMemoriloEditorOptions(fragment), [fragment])
  const editor = useEditor({
    ...editorOptions,
    onCreate({ editor }) {
      setSnapshot(formatSnapshot(fragment.toJSON()))
      editorOptions.onCreate?.({ editor })
    },
    onUpdate({ editor }) {
      setSnapshot(formatSnapshot(fragment.toJSON()))
      editorOptions.onUpdate?.({ editor })
    },
  }, [editorOptions, fragment])

  useEffect(() => {
    const handleChange = () => setSnapshot(formatSnapshot(fragment.toJSON()))
    fragment.observeDeep(handleChange)
    return () => fragment.unobserveDeep(handleChange)
  }, [fragment])

  useEffect(() => {
    if (!editor) {
      delete window.__bubbleFixture
      return
    }

    window.__bubbleFixture = {
      getJSON: () => editor.getJSON(),
      selectTableCells: (anchorRow, anchorCol, headRow, headCol) => {
        const anchorPos = getTableCellPos(editor, anchorRow, anchorCol)
        const headPos = getTableCellPos(editor, headRow, headCol)
        const selection = CellSelection.create(editor.state.doc, anchorPos, headPos)
        editor.view.dispatch(editor.state.tr.setSelection(selection))
        editor.view.focus()
      },
      mergeSelectedCells: () => {
        return editor.chain().focus().mergeCells().run()
      },
      focusTableCell: (row, col) => {
        const cellPos = getTableCellPos(editor, row, col)
        return editor.chain().focus().setTextSelection(cellPos + 1).run()
      },
      readSelectionState: () => {
        const { selection } = editor.state
        return {
          empty: selection.empty,
          from: selection.from,
          to: selection.to,
          type: selection.constructor.name,
          anchorCellPos: selection instanceof CellSelection ? selection.$anchorCell.pos : null,
          headCellPos: selection instanceof CellSelection ? selection.$headCell.pos : null,
          canMergeCells: editor.can().mergeCells(),
          canSplitCell: editor.can().splitCell(),
        }
      },
      renderError: null,
    }

    return () => {
      delete window.__bubbleFixture
    }
  }, [editor, fragment])

  return (
    <main className="fixture-shell">
      <div className="fixture-grid">
        <section className="fixture-panel">
          <h1 className="fixture-label">Editor</h1>
          <div className="fixture-editor" data-testid="bubble-editor">
            <div className="memorilo-editor px-8 py-4 [&_.ProseMirror]:outline-none">
              <BubbleMenuErrorBoundary>
                {editor ? <EditorBubbleMenu editor={editor} /> : null}
              </BubbleMenuErrorBoundary>
              <EditorContent editor={editor} />
            </div>
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
