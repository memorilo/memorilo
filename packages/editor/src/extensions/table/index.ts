import type { TableCellOptions, TableHeaderOptions, TableOptions, TableRowOptions } from '@tiptap/extension-table'
import type { Node as ProseMirrorNode, ResolvedPos, Schema } from '@tiptap/pm/model'
import { Extension } from '@tiptap/core'
import {
  createTable,
  Table,
  TableCell,
  TableHeader,
  TableRow,
} from '@tiptap/extension-table'
import { createTextAlignAttribute } from './table-align'
import './table.css'

export interface TableExtensionOptions {
  rows: number
  cols: number
  withHeaderRow: boolean
  table: Partial<TableOptions>
  tableRow: Partial<TableRowOptions>
  tableHeader: Partial<TableHeaderOptions>
  tableCell: Partial<TableCellOptions>
}

const AlignedTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...createTextAlignAttribute(),
    }
  },
})

const AlignedTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...createTextAlignAttribute(),
    }
  },
})

function isOutlineItemSelection($pos: ResolvedPos) {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const name = $pos.node(depth).type.name
    if (name === 'listItem' || name === 'taskItem' || name === 'orderedItem') {
      return true
    }
  }
  return false
}

function createBulletListWithTable(
  schema: Schema,
  tableNode: ProseMirrorNode,
) {
  const listItemType = schema.nodes.listItem
  const bulletListType = schema.nodes.bulletList
  if (!listItemType || !bulletListType) {
    return null
  }

  const listItem = listItemType.create(null, tableNode)
  return bulletListType.create(null, listItem)
}

export const TableExtension = Extension.create<TableExtensionOptions>({
  name: 'tableExtension',

  addOptions() {
    return {
      rows: 3,
      cols: 3,
      withHeaderRow: true,
      table: {
        resizable: true,
        allowTableNodeSelection: true,
      },
      tableRow: {
        HTMLAttributes: {},
      },
      tableHeader: {
        HTMLAttributes: {},
      },
      tableCell: {
        HTMLAttributes: {},
      },
    }
  },

  addExtensions() {
    return [
      Table.configure(this.options.table),
      TableRow.configure(this.options.tableRow),
      AlignedTableHeader.configure(this.options.tableHeader),
      AlignedTableCell.configure(this.options.tableCell),
    ]
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Alt-t': () => {
        if (this.editor.isActive('table')) {
          return false
        }
        const inserted = this.editor
          .chain()
          .focus()
          .insertTable({ rows: this.options.rows, cols: this.options.cols, withHeaderRow: this.options.withHeaderRow })
          .run()
        if (inserted) {
          return true
        }

        const { state, view } = this.editor
        if (!view) {
          return false
        }
        if (isOutlineItemSelection(state.selection.$from)) {
          return false
        }

        const tableNode = createTable(
          state.schema,
          this.options.rows,
          this.options.cols,
          this.options.withHeaderRow,
        )
        const listNode = createBulletListWithTable(state.schema, tableNode)
        if (!listNode) {
          return false
        }

        const tr = state.tr.replaceSelectionWith(listNode, false)
        view.dispatch(tr.scrollIntoView())
        return true
      },
    }
  },
})
