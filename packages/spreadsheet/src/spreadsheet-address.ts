import type { Effect as EffectType } from 'effect'
import type {
  SpreadsheetCellProjection,
  SpreadsheetSelection,
  SpreadsheetSheet,
  SpreadsheetSheetProjection,
} from './spreadsheet-schema'
import { Effect } from 'effect'
import {
  SpreadsheetAddressError,
  spreadsheetCellKey,
  SpreadsheetSelectionError,
} from './spreadsheet-schema'

const cellAddressPattern = /^\$?([A-Z]+)\$?([1-9]\d*)$/u

const emptySpreadsheetCell: SpreadsheetCellProjection = {
  display: '',
  format: {},
  formulaReferences: [],
  input: '',
}

function columnIndex(label: string): number {
  let index = 0
  for (const character of label)
    index = index * 26 + character.codePointAt(0)! - 64
  return index - 1
}

export function spreadsheetColumnLabel(index: number): string {
  let label = ''
  let remaining = index + 1
  while (remaining > 0) {
    const digit = (remaining - 1) % 26
    label = String.fromCodePoint(65 + digit) + label
    remaining = Math.floor((remaining - 1) / 26)
  }
  return label
}

export function parseSpreadsheetAddress(
  address: string,
  sheet: Pick<SpreadsheetSheet, 'columns' | 'id' | 'rows'>,
): EffectType.Effect<SpreadsheetSelection, SpreadsheetAddressError> {
  const match = cellAddressPattern.exec(address)
  if (!match) {
    return Effect.fail(new SpreadsheetAddressError({
      address,
      message: `Expected an A1-style CellAddress, received ${JSON.stringify(address)}`,
      sheetId: sheet.id,
    }))
  }

  const selection = {
    column: columnIndex(match[1]!),
    row: Number(match[2]) - 1,
  }
  if (selection.column >= sheet.columns.length || selection.row >= sheet.rows.length) {
    return Effect.fail(new SpreadsheetAddressError({
      address,
      message: `CellAddress ${address} is outside Sheet ${sheet.id}`,
      sheetId: sheet.id,
    }))
  }
  return Effect.succeed(selection)
}

export function spreadsheetAddress(
  selection: SpreadsheetSelection,
  sheet: Pick<SpreadsheetSheet, 'columns' | 'id' | 'rows'>,
): EffectType.Effect<string, SpreadsheetSelectionError> {
  const valid = Number.isSafeInteger(selection.column)
    && Number.isSafeInteger(selection.row)
    && selection.column >= 0
    && selection.column < sheet.columns.length
    && selection.row >= 0
    && selection.row < sheet.rows.length
  if (!valid) {
    return Effect.fail(new SpreadsheetSelectionError({
      column: selection.column,
      message: `Selection (${selection.column}, ${selection.row}) is outside Sheet ${sheet.id}`,
      row: selection.row,
      sheetId: sheet.id,
    }))
  }

  return Effect.succeed(`${spreadsheetColumnLabel(selection.column)}${selection.row + 1}`)
}

/** Keeps a preferred selection when valid, otherwise selects the first Cell. */
export function resolveSpreadsheetSelection(
  sheet: Pick<SpreadsheetSheet, 'columns' | 'rows'>,
  preferred?: SpreadsheetSelection,
): SpreadsheetSelection {
  if (preferred
    && Number.isSafeInteger(preferred.column)
    && Number.isSafeInteger(preferred.row)
    && preferred.column >= 0
    && preferred.column < sheet.columns.length
    && preferred.row >= 0
    && preferred.row < sheet.rows.length) {
    return preferred
  }
  return { column: 0, row: 0 }
}

export function readSpreadsheetCell(
  sheet: SpreadsheetSheetProjection,
  address: string,
): EffectType.Effect<SpreadsheetCellProjection, SpreadsheetAddressError> {
  return Effect.map(parseSpreadsheetAddress(address, sheet), ({ column, row }) => {
    const rowId = sheet.rows[row]!.id
    const columnId = sheet.columns[column]!.id
    return sheet.cells[spreadsheetCellKey(rowId, columnId)] ?? emptySpreadsheetCell
  })
}
