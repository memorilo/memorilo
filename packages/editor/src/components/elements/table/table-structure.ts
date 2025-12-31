import type { MemoriloElementStrings, TableCellElementType, TableHeaderCellElementType, TableRowElementType } from '../../../slate'
import { TABLE_BLOCKS } from './type'

export function createTableRow(cellType: MemoriloElementStrings, columnCount: number): TableRowElementType {
  const safeColumnCount = Math.max(1, columnCount)
  return {
    type: TABLE_BLOCKS.tr,
    children: Array.from({ length: safeColumnCount }).map(() => createTableCell(cellType)),
  } satisfies TableRowElementType
}

export function createTableCell(cellType: MemoriloElementStrings): TableCellElementType | TableHeaderCellElementType {
  const type = cellType === TABLE_BLOCKS.th ? TABLE_BLOCKS.th : TABLE_BLOCKS.td
  return {
    type,
    children: [{
      type: TABLE_BLOCKS.content,
      children: [{ text: '' }],
    }],
  }
}
