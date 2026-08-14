import type {
  SpreadsheetFormulaBindingContext,
  SpreadsheetSheet,
  SpreadsheetTopicWorkbook,
  SpreadsheetWorkbook,
} from './spreadsheet-model'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  bindSpreadsheetCellInput,
  evaluateSpreadsheetWorkbooks,
  readSpreadsheetCell,
  spreadsheetCellKey,
} from './spreadsheet-model'

function sheet(
  id: string,
  name: string,
  rows: readonly string[],
  columns: readonly string[],
  cells: SpreadsheetSheet['cells'] = {},
): SpreadsheetSheet {
  return {
    cells,
    columns: columns.map(columnId => ({ id: columnId })),
    id,
    name,
    rows: rows.map(rowId => ({ id: rowId })),
  }
}

function workbook(...sheets: readonly SpreadsheetSheet[]): SpreadsheetWorkbook {
  return { sheets }
}

function bindingContext(
  currentTopicId: string,
  currentSheetId: string,
  topics: readonly SpreadsheetTopicWorkbook[],
): SpreadsheetFormulaBindingContext {
  return { currentSheetId, currentTopicId, topics }
}

function projectedCell(
  topics: readonly SpreadsheetTopicWorkbook[],
  topicId: string,
  sheetId: string,
  address: string,
) {
  const projections = evaluateSpreadsheetWorkbooks(topics)
  const projected = projections.get(topicId)
  if (!projected)
    throw new Error(`Missing projected SpreadsheetTopic ${topicId}`)
  const projectedSheet = projected.sheets.find(candidate => candidate.id === sheetId)
  if (!projectedSheet)
    throw new Error(`Missing projected Sheet ${sheetId}`)
  return Effect.runSync(readSpreadsheetCell(projectedSheet, address))
}

describe('spreadsheet formula model', () => {
  it('binds a cross-Topic formula to stable Cell identity and evaluates it', () => {
    const budget = workbook(sheet('budget-q1', 'Q1', ['budget-row'], ['budget-amount'], {
      [spreadsheetCellKey('budget-row', 'budget-amount')]: {
        format: { kind: 'currency' },
        formulaReferences: [],
        input: '21',
      },
    }))
    const report = workbook(sheet('report-summary', 'Summary', ['report-row'], ['report-total']))
    const topics: SpreadsheetTopicWorkbook[] = [
      { title: 'Budget', topicId: 'budget-topic', workbook: budget },
      { title: 'Report', topicId: 'report-topic', workbook: report },
    ]
    const input = '=\'[Budget]Q1\'!A1*2'
    const bound = bindSpreadsheetCellInput(
      input,
      bindingContext('report-topic', 'report-summary', topics),
    )
    const updatedReport = workbook({
      ...report.sheets[0]!,
      cells: {
        [spreadsheetCellKey('report-row', 'report-total')]: {
          format: {},
          formulaReferences: bound.formulaReferences,
          input: bound.input,
        },
      },
    })

    expect(bound.formulaReferences).toEqual([{
      columnId: 'budget-amount',
      rowId: 'budget-row',
      sheetId: 'budget-q1',
      sourceEnd: input.indexOf('*'),
      sourceStart: 1,
      topicId: 'budget-topic',
    }])
    expect(projectedCell(
      [topics[0]!, { ...topics[1]!, workbook: updatedReport }],
      'report-topic',
      'report-summary',
      'A1',
    )).toMatchObject({ display: '42', input })
  })

  it('keeps a formula bound to the same Cell when Rows are reordered', () => {
    const source = workbook(sheet('source-sheet', 'Source', ['row-a', 'row-b'], ['value'], {
      [spreadsheetCellKey('row-a', 'value')]: { format: {}, formulaReferences: [], input: '7' },
      [spreadsheetCellKey('row-b', 'value')]: { format: {}, formulaReferences: [], input: '100' },
    }))
    const destination = workbook(sheet('destination-sheet', 'Destination', ['result'], ['value']))
    const initialTopics: SpreadsheetTopicWorkbook[] = [
      { title: 'Source Topic', topicId: 'source-topic', workbook: source },
      { title: 'Destination Topic', topicId: 'destination-topic', workbook: destination },
    ]
    const bound = bindSpreadsheetCellInput(
      '=\'[Source Topic]Source\'!A1',
      bindingContext('destination-topic', 'destination-sheet', initialTopics),
    )
    const withFormula = workbook({
      ...destination.sheets[0]!,
      cells: {
        [spreadsheetCellKey('result', 'value')]: { format: {}, ...bound },
      },
    })
    const reorderedSource = workbook({
      ...source.sheets[0]!,
      rows: [{ id: 'row-b' }, { id: 'row-a' }],
    })

    expect(projectedCell([
      { title: 'Source Topic', topicId: 'source-topic', workbook: reorderedSource },
      { title: 'Destination Topic', topicId: 'destination-topic', workbook: withFormula },
    ], 'destination-topic', 'destination-sheet', 'A1').display).toBe('7')
  })

  it('derives reference and cycle errors without storing computed values', () => {
    const deletedReference = {
      columnId: 'missing-column',
      rowId: 'missing-row',
      sheetId: 'sheet-a',
      sourceEnd: 3,
      sourceStart: 1,
      topicId: 'topic-a',
    }
    const topicA = workbook(sheet('sheet-a', 'A', ['row-a'], ['column-a'], {
      [spreadsheetCellKey('row-a', 'column-a')]: {
        format: {},
        formulaReferences: [deletedReference],
        input: '=A2',
      },
    }))
    expect(projectedCell([
      { title: 'A', topicId: 'topic-a', workbook: topicA },
    ], 'topic-a', 'sheet-a', 'A1').display).toBe('#REF!')

    const cycleAInput = '=\'[B]B\'!A1'
    const cycleBInput = '=\'[A]A\'!A1'
    const unboundA = workbook(sheet('sheet-a', 'A', ['row-a'], ['column-a']))
    const unboundB = workbook(sheet('sheet-b', 'B', ['row-b'], ['column-b']))
    const unboundTopics: SpreadsheetTopicWorkbook[] = [
      { title: 'A', topicId: 'topic-a', workbook: unboundA },
      { title: 'B', topicId: 'topic-b', workbook: unboundB },
    ]
    const cycleA = workbook({
      ...unboundA.sheets[0]!,
      cells: {
        [spreadsheetCellKey('row-a', 'column-a')]: {
          format: {},
          ...bindSpreadsheetCellInput(cycleAInput, bindingContext('topic-a', 'sheet-a', unboundTopics)),
        },
      },
    })
    const cycleB = workbook({
      ...unboundB.sheets[0]!,
      cells: {
        [spreadsheetCellKey('row-b', 'column-b')]: {
          format: {},
          ...bindSpreadsheetCellInput(cycleBInput, bindingContext('topic-b', 'sheet-b', unboundTopics)),
        },
      },
    })
    const cycleTopics: SpreadsheetTopicWorkbook[] = [
      { title: 'A', topicId: 'topic-a', workbook: cycleA },
      { title: 'B', topicId: 'topic-b', workbook: cycleB },
    ]

    expect(projectedCell(cycleTopics, 'topic-a', 'sheet-a', 'A1').display).toBe('#CYCLE!')
    expect(projectedCell(cycleTopics, 'topic-b', 'sheet-b', 'A1').display).toBe('#CYCLE!')
    expect(cycleA.sheets[0]!.cells[spreadsheetCellKey('row-a', 'column-a')]).not.toHaveProperty('display')
  })
})
