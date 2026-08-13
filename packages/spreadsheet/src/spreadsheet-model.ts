import type { Effect as EffectType } from 'effect'
import { Data, Effect, Schema } from 'effect'

const columnLabels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const cellAddressPattern = /^([A-Z])([1-9]\d*)$/u

const PositiveIntegerSchema = Schema.Int.check(Schema.isGreaterThan(0))
const SpreadsheetColumnCountSchema = PositiveIntegerSchema.check(Schema.isLessThanOrEqualTo(columnLabels.length))

export const strictSpreadsheetParseOptions = {
  errors: 'all',
  onExcessProperty: 'error',
} as const

export const SpreadsheetCellKindSchema = Schema.Literals(['currency', 'number', 'percent', 'text'])

export const SpreadsheetCellSchema = Schema.Struct({
  display: Schema.String,
  input: Schema.String,
  kind: Schema.optionalKey(SpreadsheetCellKindSchema),
})

export const SpreadsheetSheetSchema = Schema.Struct({
  cells: Schema.Record(Schema.String, SpreadsheetCellSchema),
  columnCount: SpreadsheetColumnCountSchema,
  id: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  rowCount: PositiveIntegerSchema,
}).check(Schema.makeFilter((sheet) => {
  for (const address of Object.keys(sheet.cells)) {
    const match = cellAddressPattern.exec(address)
    if (!match) {
      return {
        message: `expected an A1-style cell address, received ${JSON.stringify(address)}`,
        path: ['cells', address],
      }
    }

    const column = columnLabels.indexOf(match[1]!)
    const row = Number(match[2]) - 1
    if (column >= sheet.columnCount || row >= sheet.rowCount) {
      return {
        message: `cell ${address} is outside the ${sheet.columnCount} by ${sheet.rowCount} sheet`,
        path: ['cells', address],
      }
    }
  }
  return undefined
}, {
  expected: 'a sheet whose cell addresses are inside its declared dimensions',
}))

export const SpreadsheetWorkbookSchema = Schema.Struct({
  sheets: Schema.Array(SpreadsheetSheetSchema),
  title: Schema.NonEmptyString,
}).check(Schema.makeFilter((workbook) => {
  if (workbook.sheets.length === 0) {
    return {
      message: 'expected at least one spreadsheet sheet',
      path: ['sheets'],
    }
  }

  const ids = new Set<string>()
  for (const [index, sheet] of workbook.sheets.entries()) {
    if (ids.has(sheet.id)) {
      return {
        message: `duplicate spreadsheet sheet id: ${JSON.stringify(sheet.id)}`,
        path: ['sheets', index, 'id'],
      }
    }
    ids.add(sheet.id)
  }
  return undefined
}, {
  expected: 'a non-empty workbook with unique sheet ids',
}))

export const SpreadsheetCollaboratorSchema = Schema.Struct({
  color: Schema.NonEmptyString,
  id: Schema.NonEmptyString,
  initials: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
})

export const SpreadsheetCollaboratorsSchema = Schema.Array(SpreadsheetCollaboratorSchema).check(Schema.makeFilter((collaborators) => {
  const ids = new Set<string>()
  for (const [index, collaborator] of collaborators.entries()) {
    if (ids.has(collaborator.id)) {
      return {
        message: `duplicate spreadsheet collaborator id: ${JSON.stringify(collaborator.id)}`,
        path: [index, 'id'],
      }
    }
    ids.add(collaborator.id)
  }
  return undefined
}, {
  expected: 'spreadsheet collaborators with unique ids',
}))

export const SpreadsheetLockSchema = Schema.Union([
  Schema.Struct({ state: Schema.Literal('available') }),
  Schema.Struct({ state: Schema.Literal('acquiring') }),
  Schema.Struct({ owner: SpreadsheetCollaboratorSchema, state: Schema.Literal('locked') }),
  Schema.Struct({ owner: SpreadsheetCollaboratorSchema, state: Schema.Literal('owned') }),
])

export type SpreadsheetCellKind = typeof SpreadsheetCellKindSchema.Type
export type SpreadsheetCell = typeof SpreadsheetCellSchema.Type
export type SpreadsheetSheet = typeof SpreadsheetSheetSchema.Type
export type SpreadsheetWorkbook = typeof SpreadsheetWorkbookSchema.Type
export type SpreadsheetCollaborator = typeof SpreadsheetCollaboratorSchema.Type
export type SpreadsheetLock = typeof SpreadsheetLockSchema.Type

export interface SpreadsheetSelection {
  readonly column: number
  readonly row: number
}

export interface SpreadsheetCellUpdate {
  readonly address: string
  readonly input: string
  readonly sheetId: string
}

// eslint-disable-next-line unicorn/throw-new-error
export class SpreadsheetSheetNotFoundError extends Data.TaggedError('SpreadsheetSheetNotFoundError')<{
  message: string
  sheetId: string
}> {}

// eslint-disable-next-line unicorn/throw-new-error
export class SpreadsheetAddressError extends Data.TaggedError('SpreadsheetAddressError')<{
  address: string
  message: string
  sheetId: string
}> {}

// eslint-disable-next-line unicorn/throw-new-error
export class SpreadsheetSelectionError extends Data.TaggedError('SpreadsheetSelectionError')<{
  column: number
  message: string
  row: number
  sheetId: string
}> {}

export type SpreadsheetModelError
  = | SpreadsheetAddressError
    | SpreadsheetSelectionError
    | SpreadsheetSheetNotFoundError

const emptySpreadsheetCell: SpreadsheetCell = { display: '', input: '' }

/** Validates unknown workbook data and retains every schema issue in Effect's error channel. */
export function validateSpreadsheetWorkbook(input: unknown): EffectType.Effect<SpreadsheetWorkbook, Schema.SchemaError> {
  return Schema.decodeUnknownEffect(SpreadsheetWorkbookSchema)(input, strictSpreadsheetParseOptions)
}

/** Validates unknown collaborator data at the UI boundary. */
export function validateSpreadsheetCollaborators(input: unknown): EffectType.Effect<readonly SpreadsheetCollaborator[], Schema.SchemaError> {
  return Schema.decodeUnknownEffect(SpreadsheetCollaboratorsSchema)(input, strictSpreadsheetParseOptions)
}

/** Validates the lock state before it controls editing permissions. */
export function validateSpreadsheetLock(input: unknown): EffectType.Effect<SpreadsheetLock, Schema.SchemaError> {
  return Schema.decodeUnknownEffect(SpreadsheetLockSchema)(input, strictSpreadsheetParseOptions)
}

export function resolveSpreadsheetSheet(
  workbook: SpreadsheetWorkbook,
  sheetId: string,
): EffectType.Effect<SpreadsheetSheet, SpreadsheetSheetNotFoundError> {
  const sheet = workbook.sheets.find(candidate => candidate.id === sheetId)
  return sheet
    ? Effect.succeed(sheet)
    : Effect.fail(new SpreadsheetSheetNotFoundError({
        message: `Spreadsheet sheet does not exist: ${sheetId}`,
        sheetId,
      }))
}

export function parseSpreadsheetAddress(
  address: string,
  sheet: SpreadsheetSheet,
): EffectType.Effect<SpreadsheetSelection, SpreadsheetAddressError> {
  const match = cellAddressPattern.exec(address)
  if (!match) {
    return Effect.fail(new SpreadsheetAddressError({
      address,
      message: `Expected an A1-style cell address, received ${JSON.stringify(address)}`,
      sheetId: sheet.id,
    }))
  }

  const selection = {
    column: columnLabels.indexOf(match[1]!),
    row: Number(match[2]) - 1,
  }
  if (selection.column >= sheet.columnCount || selection.row >= sheet.rowCount) {
    return Effect.fail(new SpreadsheetAddressError({
      address,
      message: `Cell ${address} is outside sheet ${sheet.id}`,
      sheetId: sheet.id,
    }))
  }
  return Effect.succeed(selection)
}

export function spreadsheetAddress(
  selection: SpreadsheetSelection,
  sheet: SpreadsheetSheet,
): EffectType.Effect<string, SpreadsheetSelectionError> {
  const valid = Number.isSafeInteger(selection.column)
    && Number.isSafeInteger(selection.row)
    && selection.column >= 0
    && selection.column < sheet.columnCount
    && selection.row >= 0
    && selection.row < sheet.rowCount
  if (!valid) {
    return Effect.fail(new SpreadsheetSelectionError({
      column: selection.column,
      message: `Selection (${selection.column}, ${selection.row}) is outside sheet ${sheet.id}`,
      row: selection.row,
      sheetId: sheet.id,
    }))
  }

  return Effect.succeed(`${columnLabels[selection.column]}${selection.row + 1}`)
}

/** Keeps a preferred selection when valid, otherwise selects the first cell. */
export function resolveSpreadsheetSelection(
  sheet: SpreadsheetSheet,
  preferred?: SpreadsheetSelection,
): SpreadsheetSelection {
  if (preferred
    && Number.isSafeInteger(preferred.column)
    && Number.isSafeInteger(preferred.row)
    && preferred.column >= 0
    && preferred.column < sheet.columnCount
    && preferred.row >= 0
    && preferred.row < sheet.rowCount) {
    return preferred
  }
  return { column: 0, row: 0 }
}

export function readSpreadsheetCell(
  sheet: SpreadsheetSheet,
  address: string,
): EffectType.Effect<SpreadsheetCell, SpreadsheetAddressError> {
  return Effect.map(
    parseSpreadsheetAddress(address, sheet),
    () => sheet.cells[address] ?? emptySpreadsheetCell,
  )
}

/** Applies one validated cell input update without mutating the workbook. */
export function updateSpreadsheetCell(
  workbook: SpreadsheetWorkbook,
  update: SpreadsheetCellUpdate,
): EffectType.Effect<SpreadsheetWorkbook, SpreadsheetAddressError | SpreadsheetSheetNotFoundError> {
  return Effect.gen(function* () {
    const sheet = yield* resolveSpreadsheetSheet(workbook, update.sheetId)
    yield* parseSpreadsheetAddress(update.address, sheet)
    const previous = sheet.cells[update.address]
    const nextCell: SpreadsheetCell = {
      ...previous,
      display: update.input,
      input: update.input,
    }
    return {
      ...workbook,
      sheets: workbook.sheets.map(candidate => candidate.id === update.sheetId
        ? {
            ...candidate,
            cells: {
              ...candidate.cells,
              [update.address]: nextCell,
            },
          }
        : candidate),
    }
  })
}
