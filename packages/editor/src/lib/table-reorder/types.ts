import type { Path } from 'slate'

/**
 * Drag payload for moving a table row.
 */
export interface TableRowDragItem {
  tablePath: Path
  rowPath: Path
}

/**
 * Drag payload for moving a table column.
 */
export interface TableColumnDragItem {
  tablePath: Path
  columnIndex: number
}
