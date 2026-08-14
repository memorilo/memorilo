import type { SpreadsheetSheetProjection } from '@memorilo/spreadsheet'
import { readSpreadsheetCell } from '@memorilo/spreadsheet'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { createEditorNote } from './editor-note'

function firstSheet(note: ReturnType<typeof createEditorNote>, topicId: string): SpreadsheetSheetProjection {
  const sheet = note.getSpreadsheetTopic(topicId).getWorkbook().sheets[0]
  if (!sheet)
    throw new Error(`SpreadsheetTopic ${topicId} is missing its first Sheet`)
  return sheet
}

describe('spreadsheetTopic CRDT state', () => {
  it('creates, restores, and validates a cell-native Workbook without a Block tree', async () => {
    const source = createEditorNote({ id: 'spreadsheet-create' })
    const topicId = source.createSpreadsheetTopic({
      columnCount: 3,
      rowCount: 4,
      title: 'Budget',
    })
    const entry = source.getEntries().find(candidate => candidate.id === topicId)
    const workbook = source.getSpreadsheetTopic(topicId).getWorkbook()

    expect(entry).toMatchObject({ title: 'Budget', topicType: 'spreadsheet' })
    expect(workbook.sheets).toHaveLength(1)
    expect(workbook.sheets[0]).toMatchObject({ name: 'Sheet 1' })
    expect(workbook.sheets[0]?.rows).toHaveLength(4)
    expect(workbook.sheets[0]?.columns).toHaveLength(3)
    expect(source.getTopicValidationInput(topicId).entry).not.toHaveProperty('blockTreeKey')
    expect(source.getTopicValidationInput(topicId).entry).not.toHaveProperty('editorMode')
    await expect(Effect.runPromise(source.validateTopic(topicId))).resolves.toMatchObject({
      entry: { entryId: topicId, topicType: 'spreadsheet' },
    })

    const restored = createEditorNote({ id: source.id, snapshot: source.exportSnapshot() })
    expect(restored.getEntries()).toEqual(source.getEntries())
    expect(restored.getSpreadsheetTopic(topicId).getWorkbook()).toEqual(workbook)
  })

  it('evaluates formulas across SpreadsheetTopics in the same Note', () => {
    const note = createEditorNote({ id: 'spreadsheet-formulas' })
    const budgetTopicId = note.createSpreadsheetTopic({ columnCount: 2, rowCount: 2, title: 'Budget' })
    const reportTopicId = note.createSpreadsheetTopic({ columnCount: 2, rowCount: 2, title: 'Report' })
    const budgetSheet = firstSheet(note, budgetTopicId)
    const reportSheet = firstSheet(note, reportTopicId)
    const budgetRow = budgetSheet.rows[0]!
    const budgetColumn = budgetSheet.columns[0]!
    const reportRow = reportSheet.rows[0]!
    const reportColumn = reportSheet.columns[0]!

    note.getSpreadsheetTopic(budgetTopicId).apply([{
      columnId: budgetColumn.id,
      input: '21',
      rowId: budgetRow.id,
      sheetId: budgetSheet.id,
      type: 'set-cell-input',
    }])
    note.getSpreadsheetTopic(reportTopicId).apply([{
      columnId: reportColumn.id,
      input: '=\'[Budget]Sheet 1\'!A1*2',
      rowId: reportRow.id,
      sheetId: reportSheet.id,
      type: 'set-cell-input',
    }])

    const report = firstSheet(note, reportTopicId)
    expect(Effect.runSync(readSpreadsheetCell(report, 'A1'))).toMatchObject({
      display: '42',
      formulaReferences: [{
        columnId: budgetColumn.id,
        rowId: budgetRow.id,
        sheetId: budgetSheet.id,
        topicId: budgetTopicId,
      }],
    })
  })

  it('merges concurrent Cell content and formatting through separate conflict domains', () => {
    const source = createEditorNote({ id: 'spreadsheet-convergence' })
    const topicId = source.createSpreadsheetTopic({ columnCount: 2, rowCount: 2, title: 'Shared' })
    const sheet = firstSheet(source, topicId)
    const rowId = sheet.rows[0]!.id
    const columnId = sheet.columns[0]!.id
    const left = createEditorNote({ id: source.id, snapshot: source.exportSnapshot() })
    const right = createEditorNote({ id: source.id, snapshot: source.exportSnapshot() })
    const baseline = left.getVersion()

    left.getSpreadsheetTopic(topicId).apply([{
      columnId,
      input: '12',
      rowId,
      sheetId: sheet.id,
      type: 'set-cell-input',
    }])
    right.getSpreadsheetTopic(topicId).apply([{
      columnId,
      format: { bold: true, kind: 'currency' },
      rowId,
      sheetId: sheet.id,
      type: 'set-cell-format',
    }])
    const leftUpdate = left.exportUpdates(baseline)
    const rightUpdate = right.exportUpdates(baseline)

    expect(left.importUpdates(rightUpdate).topicIds).toContain(topicId)
    expect(right.importUpdates(leftUpdate).topicIds).toContain(topicId)
    const leftCell = Effect.runSync(readSpreadsheetCell(firstSheet(left, topicId), 'A1'))
    const rightCell = Effect.runSync(readSpreadsheetCell(firstSheet(right, topicId), 'A1'))
    expect(leftCell).toEqual(rightCell)
    expect(leftCell).toMatchObject({
      display: '12',
      format: { bold: true, kind: 'currency' },
      input: '12',
    })
  })
})
