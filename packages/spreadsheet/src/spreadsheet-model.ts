import type { Effect as EffectType } from 'effect'
import { Data, Effect, Schema } from 'effect'
import { DetailedCellError, HyperFormula } from 'hyperformula'

const cellKeySeparator = '\u001F'
const cellAddressPattern = /^\$?([A-Z]+)\$?([1-9]\d*)$/u
const formulaReferencePattern = /(?:'((?:[^']|'')+)'|([A-Za-z_][\w. ]*))!(\$?[A-Z]+\$?[1-9]\d*)|(\$?[A-Z]+\$?[1-9]\d*)/gu

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

const emptySpreadsheetCell: SpreadsheetCellProjection = {
  display: '',
  format: {},
  formulaReferences: [],
  input: '',
}

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
  return `${rowId}${cellKeySeparator}${columnId}`
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

function columnIndex(label: string): number {
  let index = 0
  for (const character of label) {
    index = index * 26 + character.codePointAt(0)! - 64
  }
  return index - 1
}

function columnLabel(index: number): string {
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

  return Effect.succeed(`${columnLabel(selection.column)}${selection.row + 1}`)
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

function formulaStringRanges(input: string): readonly { end: number, start: number }[] {
  const ranges: { end: number, start: number }[] = []
  let index = 0
  while (index < input.length) {
    if (input[index] !== '"') {
      index += 1
      continue
    }
    const start = index
    index += 1
    while (index < input.length) {
      if (input[index] !== '"') {
        index += 1
        continue
      }
      if (input[index + 1] === '"') {
        index += 2
        continue
      }
      index += 1
      break
    }
    ranges.push({ end: index, start })
  }
  return ranges
}

function topicByTitle(context: SpreadsheetFormulaBindingContext, title: string): SpreadsheetTopicWorkbook {
  const matches = context.topics.filter(topic => topic.title === title)
  if (matches.length !== 1)
    throw new Error(`Formula Topic title ${JSON.stringify(title)} resolved to ${matches.length} Topics`)
  return matches[0]!
}

function currentTopic(context: SpreadsheetFormulaBindingContext): SpreadsheetTopicWorkbook {
  const topic = context.topics.find(candidate => candidate.topicId === context.currentTopicId)
  if (!topic)
    throw new Error(`Formula context does not contain SpreadsheetTopic ${context.currentTopicId}`)
  return topic
}

function resolveFormulaTarget(
  context: SpreadsheetFormulaBindingContext,
  qualifier: string | undefined,
  address: string,
): Omit<SpreadsheetFormulaReference, 'sourceEnd' | 'sourceStart'> {
  let topic = currentTopic(context)
  let sheetId = context.currentSheetId
  if (qualifier !== undefined) {
    const normalizedQualifier = qualifier.replaceAll('\'\'', '\'')
    let sheetName = normalizedQualifier
    if (normalizedQualifier.startsWith('[')) {
      const topicTitleEnd = normalizedQualifier.indexOf(']')
      if (topicTitleEnd <= 1 || topicTitleEnd === normalizedQualifier.length - 1)
        throw new Error(`Invalid cross-Topic formula qualifier ${JSON.stringify(normalizedQualifier)}`)
      topic = topicByTitle(context, normalizedQualifier.slice(1, topicTitleEnd))
      sheetName = normalizedQualifier.slice(topicTitleEnd + 1)
    }
    const sheets = topic.workbook.sheets.filter(candidate => candidate.name === sheetName)
    if (sheets.length !== 1)
      throw new Error(`Formula Sheet name ${JSON.stringify(sheetName)} resolved to ${sheets.length} Sheets`)
    sheetId = sheets[0]!.id
  }

  const sheet = topic.workbook.sheets.find(candidate => candidate.id === sheetId)
  if (!sheet)
    throw new Error(`Formula target does not contain Sheet ${sheetId}`)
  const selection = Effect.runSync(parseSpreadsheetAddress(address, sheet))
  return {
    columnId: sheet.columns[selection.column]!.id,
    rowId: sheet.rows[selection.row]!.id,
    sheetId: sheet.id,
    topicId: topic.topicId,
  }
}

/** Resolves visible A1 references once and stores their stable Cell identities beside the formula input. */
export function bindSpreadsheetCellInput(
  input: string,
  context: SpreadsheetFormulaBindingContext,
): Pick<SpreadsheetCell, 'formulaReferences' | 'input'> {
  if (!input.startsWith('='))
    return { formulaReferences: [], input }

  const strings = formulaStringRanges(input)
  const formulaReferences: SpreadsheetFormulaReference[] = []
  for (const match of input.matchAll(formulaReferencePattern)) {
    const sourceStart = match.index
    const sourceEnd = sourceStart + match[0].length
    if (strings.some(range => sourceStart >= range.start && sourceStart < range.end))
      continue
    const qualifiedAddress = match[3]
    const localAddress = match[4]
    const address = qualifiedAddress ?? localAddress
    if (!address)
      throw new Error('Formula reference parser did not capture a CellAddress')
    if (localAddress !== undefined && input.slice(sourceEnd).trimStart().startsWith('('))
      continue
    const qualifier = match[1] ?? match[2]
    formulaReferences.push({
      ...resolveFormulaTarget(context, qualifier, address),
      sourceEnd,
      sourceStart,
    })
  }
  return { formulaReferences, input }
}

interface EngineSheet {
  readonly engineName: string
  readonly sheet: SpreadsheetSheet
  readonly topicId: string
}

function engineSheetKey(topicId: string, sheetId: string): string {
  return `${topicId}${cellKeySeparator}${sheetId}`
}

function formulaForEngine(
  cell: SpreadsheetCell,
  engineSheets: ReadonlyMap<string, EngineSheet>,
): string {
  let formula = cell.input
  for (const reference of [...cell.formulaReferences].sort((left, right) => right.sourceStart - left.sourceStart)) {
    const target = engineSheets.get(engineSheetKey(reference.topicId, reference.sheetId))
    const row = target?.sheet.rows.findIndex(candidate => candidate.id === reference.rowId) ?? -1
    const column = target?.sheet.columns.findIndex(candidate => candidate.id === reference.columnId) ?? -1
    const replacement = !target || row < 0 || column < 0
      ? '#REF!'
      : `'${target.engineName}'!${columnLabel(column)}${row + 1}`
    formula = `${formula.slice(0, reference.sourceStart)}${replacement}${formula.slice(reference.sourceEnd)}`
  }
  return formula
}

function displayCellValue(value: ReturnType<HyperFormula['getCellValue']>): string {
  if (value === null)
    return ''
  if (value instanceof DetailedCellError)
    return value.value
  return String(value)
}

/** Builds all SpreadsheetTopic formula dependencies together so references may cross Topics in one Note. */
export function evaluateSpreadsheetWorkbooks(
  topics: readonly SpreadsheetTopicWorkbook[],
): ReadonlyMap<string, SpreadsheetWorkbookProjection> {
  const topicIds = new Set<string>()
  const engineSheets = new Map<string, EngineSheet>()
  for (const topic of topics) {
    if (topicIds.has(topic.topicId))
      throw new Error(`Duplicate SpreadsheetTopic id ${topic.topicId}`)
    topicIds.add(topic.topicId)
    Effect.runSync(validateSpreadsheetWorkbook(topic.workbook))
    for (const sheet of topic.workbook.sheets) {
      const key = engineSheetKey(topic.topicId, sheet.id)
      engineSheets.set(key, {
        engineName: `S_${engineSheets.size}`,
        sheet,
        topicId: topic.topicId,
      })
    }
  }

  const engineInput: Record<string, (boolean | null | number | string)[][]> = {}
  for (const engineSheet of engineSheets.values()) {
    engineInput[engineSheet.engineName] = engineSheet.sheet.rows.map(row => (
      engineSheet.sheet.columns.map((column) => {
        const cell = engineSheet.sheet.cells[spreadsheetCellKey(row.id, column.id)]
        if (!cell)
          return null
        return cell.input.startsWith('=') ? formulaForEngine(cell, engineSheets) : cell.input
      })
    ))
  }

  const engine = HyperFormula.buildFromSheets(engineInput, { licenseKey: 'gpl-v3' })
  try {
    const projections = new Map<string, SpreadsheetWorkbookProjection>()
    for (const topic of topics) {
      projections.set(topic.topicId, {
        sheets: topic.workbook.sheets.map((sheet) => {
          const engineSheet = engineSheets.get(engineSheetKey(topic.topicId, sheet.id))
          if (!engineSheet)
            throw new Error(`Missing formula engine Sheet for ${topic.topicId}/${sheet.id}`)
          const sheetNumber = engine.getSheetId(engineSheet.engineName)
          if (sheetNumber === undefined)
            throw new Error(`Formula engine did not create Sheet ${engineSheet.engineName}`)
          const cells = Object.fromEntries(sheet.rows.flatMap((row, rowIndex) => (
            sheet.columns.flatMap((column, columnIndex) => {
              const key = spreadsheetCellKey(row.id, column.id)
              const cell = sheet.cells[key]
              if (!cell)
                return []
              return [[key, {
                ...cell,
                display: displayCellValue(engine.getCellValue({ col: columnIndex, row: rowIndex, sheet: sheetNumber })),
              }] as const]
            })
          )))
          return { ...sheet, cells }
        }),
      })
    }
    return projections
  }
  finally {
    engine.destroy()
  }
}
