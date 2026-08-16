import type {
  SpreadsheetCell,
  SpreadsheetFormulaBindingContext,
  SpreadsheetFormulaReference,
  SpreadsheetSheet,
  SpreadsheetTopicWorkbook,
  SpreadsheetWorkbookProjection,
} from './spreadsheet-schema'
import { Effect } from 'effect'
import { DetailedCellError, HyperFormula } from 'hyperformula'
import { parseSpreadsheetAddress, spreadsheetColumnLabel } from './spreadsheet-address'
import {
  spreadsheetCellKey,
  spreadsheetKeySeparator,
  validateSpreadsheetWorkbook,
} from './spreadsheet-schema'

const formulaReferencePattern = /(?:'((?:[^']|'')+)'|([A-Za-z_][\w. ]*))!(\$?[A-Z]+\$?[1-9]\d*)|(\$?[A-Z]+\$?[1-9]\d*)/gu

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
  return `${topicId}${spreadsheetKeySeparator}${sheetId}`
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
      : `'${target.engineName}'!${spreadsheetColumnLabel(column)}${row + 1}`
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
