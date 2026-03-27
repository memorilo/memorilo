import type { JSONContent } from '@tiptap/core'
import type { FixtureEnvironment } from '../fixture-app-utils'
import Text from '@tiptap/extension-text'
import { GapCursor } from '@tiptap/pm/gapcursor'
import { CellSelection } from '@tiptap/pm/tables'
import { useEditor } from '@tiptap/react'
import { useEffect, useMemo, useState } from 'react'
import { getTableContext } from '../../src/extensions/bubble-menu/table-menu-utils'
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

declare global {
  interface Window {
    __tableFixture?: {
      getJSON: () => JSONContent | null
      selectTableCells: (anchorRow: number, anchorCol: number, headRow: number, headCol: number) => void
      selectTableRows: (anchorRow: number, headRow: number) => void
      selectTableColumns: (anchorCol: number, headCol: number) => void
      mergeSelectedCells: () => boolean
      focusTableCell: (row: number, col: number) => boolean
      focusGapCursorAfterTable: () => boolean
      readSelectionState: () => {
        empty: boolean
        from: number
        to: number
        type: string
        anchorCellPos: number | null
        headCellPos: number | null
      }
    }
  }
}

function requireTableContext(editor: NonNullable<ReturnType<typeof useEditor>>) {
  const context = getTableContext(editor.state)
  if (!context) {
    throw new Error('Table fixture table context is unavailable')
  }

  return context
}

function getTableCellPos(editor: NonNullable<ReturnType<typeof useEditor>>, row: number, col: number) {
  const context = requireTableContext(editor)
  if (row < 0 || row >= context.rows) {
    throw new RangeError(`Table row ${row} is out of bounds for ${context.rows} rows`)
  }
  if (col < 0 || col >= context.cols) {
    throw new RangeError(`Table column ${col} is out of bounds for ${context.cols} columns`)
  }

  return context.tablePos + 1 + context.map.positionAt(row, col, context.tableNode)
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

  useEffect(() => {
    if (!editor) {
      delete window.__tableFixture
      return
    }

    window.__tableFixture = {
      getJSON: () => editor.getJSON(),
      selectTableCells: (anchorRow, anchorCol, headRow, headCol) => {
        const anchorPos = getTableCellPos(editor, anchorRow, anchorCol)
        const headPos = getTableCellPos(editor, headRow, headCol)
        const selection = CellSelection.create(editor.state.doc, anchorPos, headPos)
        editor.view.dispatch(editor.state.tr.setSelection(selection))
        editor.view.focus()
      },
      selectTableRows: (anchorRow, headRow) => {
        const context = requireTableContext(editor)
        const anchorPos = getTableCellPos(editor, anchorRow, 0)
        const headPos = getTableCellPos(editor, headRow, context.cols - 1)
        const selection = CellSelection.rowSelection(
          editor.state.doc.resolve(anchorPos),
          editor.state.doc.resolve(headPos),
        )
        editor.view.dispatch(editor.state.tr.setSelection(selection))
        editor.view.focus()
      },
      selectTableColumns: (anchorCol, headCol) => {
        const context = requireTableContext(editor)
        const anchorPos = getTableCellPos(editor, 0, anchorCol)
        const headPos = getTableCellPos(editor, context.rows - 1, headCol)
        const selection = CellSelection.colSelection(
          editor.state.doc.resolve(anchorPos),
          editor.state.doc.resolve(headPos),
        )
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
      focusGapCursorAfterTable: () => {
        const context = requireTableContext(editor)
        const gapCursorPos = context.tablePos + context.tableNode.nodeSize
        const selection = new GapCursor(editor.state.doc.resolve(gapCursorPos))
        editor.view.dispatch(editor.state.tr.setSelection(selection))
        editor.view.focus()
        return true
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
        }
      },
    }

    return () => {
      delete window.__tableFixture
    }
  }, [editor])

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
