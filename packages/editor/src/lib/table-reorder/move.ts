import { cloneDeep } from 'es-toolkit'
import { Editor, Node, Path, Transforms } from 'slate'
import {
  getColumnGroupRange,
  getRowCellGroupInfo,
  getRowGroupInfo,
  getRowInsertIndexForRange,
  getTableColumnGroupData,
} from './groups'

/**
 * Moves a row group to the target row, preserving merged spans.
 */
export function moveTableRow(editor: Editor, sourceRowPath: Path, targetRowPath: Path) {
  const sourceInfo = getRowGroupInfo(editor, sourceRowPath)
  const targetInfo = getRowGroupInfo(editor, targetRowPath)
  if (!sourceInfo || !targetInfo)
    return

  if (!Path.equals(sourceInfo.sectionPath, targetInfo.sectionPath))
    return

  const sourceRange = sourceInfo.range
  const targetRange = targetInfo.range
  if (sourceRange.start === targetRange.start && sourceRange.end === targetRange.end)
    return

  const sourceLength = sourceRange.end - sourceRange.start + 1
  // When moving downward, insert after the target group (indices shift after removal).
  const targetIndex = sourceRange.start < targetRange.start
    ? targetRange.end - sourceLength + 1
    : targetRange.start

  const sourceRows = sourceInfo.rowLayouts.slice(sourceRange.start, sourceRange.end + 1)
  const rowClones = sourceRows.map(row => cloneDeep(Node.get(editor, row.rowPath)))

  Editor.withoutNormalizing(editor, () => {
    for (let index = sourceRange.end; index >= sourceRange.start; index -= 1) {
      Transforms.removeNodes(editor, { at: sourceInfo.sectionPath.concat(index) })
    }

    rowClones.forEach((row, offset) => {
      Transforms.insertNodes(editor, row, { at: sourceInfo.sectionPath.concat(targetIndex + offset) })
    })
  })
}

/**
 * Returns the moved row path for a drag operation within the same section.
 */
export function getMovedRowPath(sourceRowPath: Path, targetRowPath: Path): Path | null {
  if (!Path.isSibling(sourceRowPath, targetRowPath))
    return null

  if (Path.equals(sourceRowPath, targetRowPath))
    return sourceRowPath

  // Move to the target path directly to enable swapping adjacent rows.
  return targetRowPath
}

/**
 * Moves a column group to the target index, preserving merged spans.
 */
export function moveTableColumn(editor: Editor, tablePath: Path, sourceIndex: number, targetIndex: number) {
  if (sourceIndex === targetIndex)
    return

  const columnContext = getTableColumnGroupData(editor, tablePath, { includeHiddenHead: true })
  if (!columnContext)
    return

  const { rowLayouts, columnData } = columnContext
  const sourceRange = getColumnGroupRange(columnData, sourceIndex)
  const targetRange = getColumnGroupRange(columnData, targetIndex)
  if (!sourceRange || !targetRange)
    return
  if (sourceRange.start === targetRange.start && sourceRange.end === targetRange.end)
    return

  const movingRight = sourceRange.start < targetRange.start

  Editor.withoutNormalizing(editor, () => {
    // Move each row's cells for the column group so col/row spans remain aligned.
    for (const layout of rowLayouts) {
      const sourceGroup = getRowCellGroupInfo(layout, sourceRange)
      if (!sourceGroup)
        continue

      const targetGroup = getRowCellGroupInfo(layout, targetRange)
      const targetInsertIndex = getRowInsertIndexForRange(layout, targetRange)
      const targetCellCount = targetGroup ? targetGroup.cells.length : 0
      const sourceLength = sourceGroup.cells.length
      // Match row drag semantics: insert after target when moving right, before when moving left.
      const insertIndex = movingRight && sourceGroup.startIndex < targetInsertIndex
        ? targetInsertIndex + targetCellCount - sourceLength
        : targetInsertIndex

      const cellClones = sourceGroup.cells.map(cell => cloneDeep(Node.get(editor, cell.cellPath)))

      for (let index = sourceGroup.endIndex; index >= sourceGroup.startIndex; index -= 1) {
        Transforms.removeNodes(editor, { at: layout.rowPath.concat(index) })
      }

      cellClones.forEach((cell, offset) => {
        Transforms.insertNodes(editor, cell, { at: layout.rowPath.concat(insertIndex + offset) })
      })
    }
  })
}

/**
 * Returns the moved column index for a drag operation.
 */
export function getMovedColumnIndex(sourceIndex: number, targetIndex: number): number {
  if (sourceIndex === targetIndex)
    return sourceIndex
  return targetIndex
}
