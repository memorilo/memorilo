import type { Effect as EffectType } from 'effect'
import { Data, Effect, Schema } from 'effect'

export const spreadsheetKeySeparator = '\u001F'

const NonNegativeIntegerSchema = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
const PositiveIntegerSchema = Schema.Int.check(Schema.isGreaterThan(0))

export const strictSpreadsheetParseOptions = {
  errors: 'all',
  onExcessProperty: 'error',
} as const

export const SpreadsheetCellKindSchema = Schema.Literals(['currency', 'number', 'percent', 'text'])
export const SpreadsheetHorizontalAlignmentSchema = Schema.Literals(['center', 'left', 'right'])

export const SpreadsheetCellFormatSchema = Schema.Struct({
  alignment: Schema.optionalKey(SpreadsheetHorizontalAlignmentSchema),
  bold: Schema.optionalKey(Schema.Boolean),
  fill: Schema.optionalKey(Schema.NonEmptyString),
  italic: Schema.optionalKey(Schema.Boolean),
  kind: Schema.optionalKey(SpreadsheetCellKindSchema),
  underline: Schema.optionalKey(Schema.Boolean),
})

export const SpreadsheetFormulaReferenceSchema = Schema.Struct({
  columnId: Schema.NonEmptyString,
  rowId: Schema.NonEmptyString,
  sheetId: Schema.NonEmptyString,
  sourceEnd: PositiveIntegerSchema,
  sourceStart: NonNegativeIntegerSchema,
  topicId: Schema.NonEmptyString,
}).check(Schema.makeFilter(reference => reference.sourceEnd > reference.sourceStart
  ? undefined
  : {
      message: 'expected a non-empty formula source range',
      path: ['sourceEnd'],
    }, {
  expected: 'a stable FormulaReference with a non-empty source range',
}))

export const SpreadsheetCellSchema = Schema.Struct({
  format: SpreadsheetCellFormatSchema,
  formulaReferences: Schema.Array(SpreadsheetFormulaReferenceSchema),
  input: Schema.String,
}).check(Schema.makeFilter((cell) => {
  if (cell.formulaReferences.length > 0 && !cell.input.startsWith('=')) {
    return {
      message: 'expected FormulaReferences only on formula input',
      path: ['formulaReferences'],
    }
  }
  let previousEnd = 0
  for (const [index, reference] of cell.formulaReferences.entries()) {
    if (reference.sourceEnd > cell.input.length) {
      return {
        message: 'expected FormulaReference source range inside the formula input',
        path: ['formulaReferences', index, 'sourceEnd'],
      }
    }
    if (reference.sourceStart < previousEnd) {
      return {
        message: 'expected non-overlapping FormulaReference source ranges',
        path: ['formulaReferences', index, 'sourceStart'],
      }
    }
    previousEnd = reference.sourceEnd
  }
  return undefined
}, {
  expected: 'Cell input with ordered, non-overlapping FormulaReferences',
}))

export const SpreadsheetRowSchema = Schema.Struct({ id: Schema.NonEmptyString })
export const SpreadsheetColumnSchema = Schema.Struct({ id: Schema.NonEmptyString })

export const SpreadsheetSheetSchema = Schema.Struct({
  cells: Schema.Record(Schema.String, SpreadsheetCellSchema),
  columns: Schema.Array(SpreadsheetColumnSchema),
  id: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  rows: Schema.Array(SpreadsheetRowSchema),
}).check(Schema.makeFilter((sheet) => {
  if (sheet.rows.length === 0)
    return { message: 'expected at least one Row', path: ['rows'] }
  if (sheet.columns.length === 0)
    return { message: 'expected at least one Column', path: ['columns'] }

  const rowIds = new Set<string>()
  for (const [index, row] of sheet.rows.entries()) {
    if (rowIds.has(row.id))
      return { message: `duplicate Row id ${JSON.stringify(row.id)}`, path: ['rows', index, 'id'] }
    rowIds.add(row.id)
  }
  const columnIds = new Set<string>()
  for (const [index, column] of sheet.columns.entries()) {
    if (columnIds.has(column.id))
      return { message: `duplicate Column id ${JSON.stringify(column.id)}`, path: ['columns', index, 'id'] }
    columnIds.add(column.id)
  }
  const validCellKeys = new Set(sheet.rows.flatMap(row => (
    sheet.columns.map(column => spreadsheetCellKey(row.id, column.id))
  )))
  for (const cellKey of Object.keys(sheet.cells)) {
    if (!validCellKeys.has(cellKey)) {
      return {
        message: `Cell key ${JSON.stringify(cellKey)} does not identify a current Row and Column`,
        path: ['cells', cellKey],
      }
    }
  }
  return undefined
}, {
  expected: 'a Sheet with stable, unique Row and Column identities',
}))

export const SpreadsheetWorkbookSchema = Schema.Struct({
  sheets: Schema.Array(SpreadsheetSheetSchema),
}).check(Schema.makeFilter((workbook) => {
  if (workbook.sheets.length === 0)
    return { message: 'expected at least one Sheet', path: ['sheets'] }
  const ids = new Set<string>()
  const names = new Set<string>()
  for (const [index, sheet] of workbook.sheets.entries()) {
    if (ids.has(sheet.id))
      return { message: `duplicate Sheet id ${JSON.stringify(sheet.id)}`, path: ['sheets', index, 'id'] }
    if (names.has(sheet.name))
      return { message: `duplicate Sheet name ${JSON.stringify(sheet.name)}`, path: ['sheets', index, 'name'] }
    ids.add(sheet.id)
    names.add(sheet.name)
  }
  return undefined
}, {
  expected: 'a non-empty Workbook with unique Sheet identities and names',
}))

export const SpreadsheetCellProjectionSchema = Schema.Struct({
  display: Schema.String,
  format: SpreadsheetCellFormatSchema,
  formulaReferences: Schema.Array(SpreadsheetFormulaReferenceSchema),
  input: Schema.String,
})

export const SpreadsheetSheetProjectionSchema = Schema.Struct({
  cells: Schema.Record(Schema.String, SpreadsheetCellProjectionSchema),
  columns: Schema.Array(SpreadsheetColumnSchema),
  id: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  rows: Schema.Array(SpreadsheetRowSchema),
})

export const SpreadsheetWorkbookProjectionSchema = Schema.Struct({
  sheets: Schema.Array(SpreadsheetSheetProjectionSchema),
})

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
export type SpreadsheetHorizontalAlignment = typeof SpreadsheetHorizontalAlignmentSchema.Type
export type SpreadsheetCellFormat = typeof SpreadsheetCellFormatSchema.Type
export type SpreadsheetFormulaReference = typeof SpreadsheetFormulaReferenceSchema.Type
export type SpreadsheetCell = typeof SpreadsheetCellSchema.Type
export type SpreadsheetRow = typeof SpreadsheetRowSchema.Type
export type SpreadsheetColumn = typeof SpreadsheetColumnSchema.Type
export type SpreadsheetSheet = typeof SpreadsheetSheetSchema.Type
export type SpreadsheetWorkbook = typeof SpreadsheetWorkbookSchema.Type
export type SpreadsheetCollaborator = typeof SpreadsheetCollaboratorSchema.Type
export type SpreadsheetLock = typeof SpreadsheetLockSchema.Type

export type SpreadsheetCellProjection = typeof SpreadsheetCellProjectionSchema.Type
export type SpreadsheetSheetProjection = typeof SpreadsheetSheetProjectionSchema.Type
export type SpreadsheetWorkbookProjection = typeof SpreadsheetWorkbookProjectionSchema.Type

export interface SpreadsheetTopicWorkbook {
  readonly title: string
  readonly topicId: string
  readonly workbook: SpreadsheetWorkbook
}

export interface SpreadsheetFormulaBindingContext {
  readonly currentSheetId: string
  readonly currentTopicId: string
  readonly topics: readonly SpreadsheetTopicWorkbook[]
}

export interface SpreadsheetSelection {
  readonly column: number
  readonly row: number
}

export interface SpreadsheetCellUpdate {
  readonly address: string
  readonly input: string
  readonly sheetId: string
}

export type SpreadsheetEdit
  = | {
    readonly columnId: string
    readonly input: string
    readonly rowId: string
    readonly sheetId: string
    readonly type: 'set-cell-input'
  }
  | {
    readonly columnId: string
    readonly format: SpreadsheetCellFormat
    readonly rowId: string
    readonly sheetId: string
    readonly type: 'set-cell-format'
  }
  | {
    readonly columns: readonly SpreadsheetColumn[]
    readonly name: string
    readonly rows: readonly SpreadsheetRow[]
    readonly sheetId: string
    readonly type: 'add-sheet'
  }
  | {
    readonly name: string
    readonly sheetId: string
    readonly type: 'rename-sheet'
  }

export interface SpreadsheetEditReceipt {
  readonly changedCellKeys: readonly string[]
  readonly changedSheetIds: readonly string[]
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

/** Validates unknown Workbook data and retains every schema issue in Effect's error channel. */
export function validateSpreadsheetWorkbook(input: unknown): EffectType.Effect<SpreadsheetWorkbook, Schema.SchemaError> {
  return Schema.decodeUnknownEffect(SpreadsheetWorkbookSchema)(input, strictSpreadsheetParseOptions)
}

/** Validates derived display values and the canonical Workbook structure behind them. */
export function validateSpreadsheetWorkbookProjection(
  input: unknown,
): EffectType.Effect<SpreadsheetWorkbookProjection, Schema.SchemaError> {
  return Effect.gen(function* () {
    const projection = yield* Schema.decodeUnknownEffect(SpreadsheetWorkbookProjectionSchema)(
      input,
      strictSpreadsheetParseOptions,
    )
    yield* validateSpreadsheetWorkbook({
      sheets: projection.sheets.map(sheet => ({
        ...sheet,
        cells: Object.fromEntries(Object.entries(sheet.cells).map(([key, cell]) => [key, {
          format: cell.format,
          formulaReferences: cell.formulaReferences,
          input: cell.input,
        }])),
      })),
    })
    return projection
  })
}

/** Validates unknown collaborator data at the UI boundary. */
export function validateSpreadsheetCollaborators(input: unknown): EffectType.Effect<readonly SpreadsheetCollaborator[], Schema.SchemaError> {
  return Schema.decodeUnknownEffect(SpreadsheetCollaboratorsSchema)(input, strictSpreadsheetParseOptions)
}

/** Validates the lock state before it controls editing permissions. */
export function validateSpreadsheetLock(input: unknown): EffectType.Effect<SpreadsheetLock, Schema.SchemaError> {
  return Schema.decodeUnknownEffect(SpreadsheetLockSchema)(input, strictSpreadsheetParseOptions)
}

export function spreadsheetCellKey(rowId: string, columnId: string): string {
  if (rowId.length === 0)
    throw new TypeError('Row id must be a non-empty string')
  if (columnId.length === 0)
    throw new TypeError('Column id must be a non-empty string')
  return `${rowId}${spreadsheetKeySeparator}${columnId}`
}

export function resolveSpreadsheetSheet<Sheet extends { readonly id: string }>(
  workbook: { readonly sheets: readonly Sheet[] },
  sheetId: string,
): EffectType.Effect<Sheet, SpreadsheetSheetNotFoundError> {
  const sheet = workbook.sheets.find(candidate => candidate.id === sheetId)
  return sheet
    ? Effect.succeed(sheet)
    : Effect.fail(new SpreadsheetSheetNotFoundError({
        message: `Spreadsheet Sheet does not exist: ${sheetId}`,
        sheetId,
      }))
}
