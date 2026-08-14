import { createEditorNote } from '@memorilo/editor/note'
import { describe, expect, it } from 'vitest'
import { toStoredSpreadsheets } from './note-authoritative-projection'

describe('authoritative Note spreadsheet projection', () => {
  it('projects stable Cell identities and derived cross-Topic formula values', () => {
    const note = createEditorNote({ id: 'spreadsheet-note', title: 'Plan' })
    const sourceTopicId = note.createSpreadsheetTopic({ columnCount: 2, rowCount: 2, title: 'Budget' })
    const reportTopicId = note.createSpreadsheetTopic({ columnCount: 2, rowCount: 2, title: 'Report' })
    const sourceSheet = note.getSpreadsheetTopic(sourceTopicId).getWorkbook().sheets[0]!
    const reportSheet = note.getSpreadsheetTopic(reportTopicId).getWorkbook().sheets[0]!

    note.getSpreadsheetTopic(sourceTopicId).apply([{
      columnId: sourceSheet.columns[0]!.id,
      input: '21',
      rowId: sourceSheet.rows[0]!.id,
      sheetId: sourceSheet.id,
      type: 'set-cell-input',
    }])
    note.getSpreadsheetTopic(reportTopicId).apply([{
      columnId: reportSheet.columns[0]!.id,
      input: '=\'[Budget]Sheet 1\'!A1*2',
      rowId: reportSheet.rows[0]!.id,
      sheetId: reportSheet.id,
      type: 'set-cell-input',
    }])

    const projections = toStoredSpreadsheets(note)
    const report = projections.find(projection => projection.topicId === reportTopicId)
    expect(report?.sheets[0]?.cells).toEqual([{
      columnId: reportSheet.columns[0]!.id,
      display: '42',
      format: {},
      formulaReferences: [{
        columnId: sourceSheet.columns[0]!.id,
        rowId: sourceSheet.rows[0]!.id,
        sheetId: sourceSheet.id,
        sourceEnd: 21,
        sourceStart: 1,
        topicId: sourceTopicId,
      }],
      input: '=\'[Budget]Sheet 1\'!A1*2',
      rowId: reportSheet.rows[0]!.id,
    }])
    expect(toStoredSpreadsheets(note, new Set([reportTopicId])))
      .toEqual(report === undefined ? [] : [report])
  })
})
