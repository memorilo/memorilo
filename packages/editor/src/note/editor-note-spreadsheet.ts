import type {
  SpreadsheetCell,
  SpreadsheetCellFormat,
  SpreadsheetEdit,
  SpreadsheetEditReceipt,
  SpreadsheetFormulaReference,
  SpreadsheetSheet,
  SpreadsheetTopicWorkbook,
  SpreadsheetWorkbook,
  SpreadsheetWorkbookProjection,
} from '@memorilo/spreadsheet/model'
import type { LoroDoc, LoroMap, LoroMovableList } from 'loro-crdt'
import type {
  CreateSpreadsheetTopicInput,
  SpreadsheetTopicValidationInput,
} from './editor-note'
import type { EditorNoteDocument, EditorNoteRuntime } from './editor-note-runtime'
import type { TopicContentProjection } from './topic-projection'
import {
  bindSpreadsheetCellInput,
  evaluateSpreadsheetWorkbooks,
  SpreadsheetCellFormatSchema,
  spreadsheetCellKey,
  validateSpreadsheetWorkbook,
} from '@memorilo/spreadsheet/model'
import { Effect, Schema } from 'effect'
import { LoroMap as LoroMapContainer, LoroMovableList as LoroMovableListContainer } from 'loro-crdt'
import {
  ENTRY_ID_KEY,
  ENTRY_KIND_KEY,
  findNoteEntry,
  noteTree,
  readString,
  readTopicTitle,
  readTopicType,
  SPREADSHEET_CELL_CONTENTS_KEY,
  SPREADSHEET_CELL_FORMATS_KEY,
  SPREADSHEET_COLUMN_ORDER_KEY,
  SPREADSHEET_ROW_ORDER_KEY,
  SPREADSHEET_SHEET_ID_KEY,
  SPREADSHEET_SHEET_NAME_KEY,
  SPREADSHEET_SHEET_ORDER_KEY,
  SPREADSHEET_SHEETS_KEY,
  SPREADSHEET_WORKBOOK_KEY,
  TOPIC_TITLE_KEY,
  TOPIC_TYPE_KEY,
} from './editor-note-crdt'
import {
  normalizeNonEmptyString,
  normalizeTopicTitle,
  resolveNoteEntryIndex,
} from './editor-note-validation'

const defaultSpreadsheetColumnCount = 12
const defaultSpreadsheetRowCount = 50

type NoteEntryNode = ReturnType<ReturnType<LoroDoc['getTree']>['getNodes']>[number]

interface PreparedCellInputEdit {
  readonly columnId: string
  readonly content: Pick<SpreadsheetCell, 'formulaReferences' | 'input'>
  readonly rowId: string
  readonly sheetId: string
  readonly type: 'set-cell-input'
}

type PreparedSpreadsheetEdit
  = | Exclude<SpreadsheetEdit, { readonly type: 'set-cell-input' }>
    | PreparedCellInputEdit

function normalizeDimension(value: number | undefined, fallback: number, description: string): number {
  const normalized = value === undefined ? fallback : value
  if (!Number.isSafeInteger(normalized) || normalized < 1)
    throw new RangeError(`${description} must be a positive safe integer`)
  return normalized
}

function readStringOrder(list: LoroMovableList, description: string): readonly string[] {
  const values = list.toArray()
  const seen = new Set<string>()
  return values.map((value, index) => {
    if (typeof value !== 'string' || value.length === 0)
      throw new Error(`${description} item ${index} must be a non-empty string`)
    if (seen.has(value))
      throw new Error(`${description} contains duplicate id ${value}`)
    seen.add(value)
    return value
  })
}

function spreadsheetNode(runtime: EditorNoteDocument, topicId: string): NoteEntryNode {
  const normalizedTopicId = normalizeNonEmptyString(topicId, 'SpreadsheetTopic id')
  const node = findNoteEntry(runtime.doc, normalizedTopicId)
  if (node.data.get(ENTRY_KIND_KEY) !== 'topic')
    throw new TypeError(`NoteEntry ${normalizedTopicId} is not a Topic`)
  if (readTopicType(node.data, `Topic ${normalizedTopicId} type`) !== 'spreadsheet')
    throw new TypeError(`Topic ${normalizedTopicId} is not a SpreadsheetTopic`)
  return node
}

function childMap(parent: LoroMap, key: string, description: string): LoroMap {
  const value = parent.get(key)
  if (!(value instanceof LoroMapContainer))
    throw new Error(`${description} must be a LoroMap`)
  return value
}

function childOrder(parent: LoroMap, key: string, description: string): LoroMovableList {
  const value = parent.get(key)
  if (!(value instanceof LoroMovableListContainer))
    throw new Error(`${description} must be a LoroMovableList`)
  return value
}

function workbookMap(node: NoteEntryNode): LoroMap {
  return childMap(
    node.data,
    SPREADSHEET_WORKBOOK_KEY,
    `SpreadsheetTopic ${readString(node.data, ENTRY_ID_KEY, 'SpreadsheetTopic id')} Workbook`,
  )
}

function sheetsMap(workbook: LoroMap): LoroMap {
  return childMap(workbook, SPREADSHEET_SHEETS_KEY, 'Workbook Sheets')
}

function sheetOrder(workbook: LoroMap): LoroMovableList {
  return childOrder(workbook, SPREADSHEET_SHEET_ORDER_KEY, 'Workbook Sheet order')
}

function sheetState(workbook: LoroMap, sheetId: string): LoroMap {
  const normalizedSheetId = normalizeNonEmptyString(sheetId, 'Sheet id')
  const value = sheetsMap(workbook).get(normalizedSheetId)
  if (!(value instanceof LoroMapContainer))
    throw new Error(`Workbook does not contain Sheet ${normalizedSheetId}`)
  const storedId = readString(value, SPREADSHEET_SHEET_ID_KEY, `Sheet ${normalizedSheetId} id`)
  if (storedId !== normalizedSheetId)
    throw new Error(`Sheet map key ${normalizedSheetId} does not match stored id ${storedId}`)
  return value
}

function cellContent(value: unknown, key: string): Pick<SpreadsheetCell, 'formulaReferences' | 'input'> {
  if (value === undefined)
    return { formulaReferences: [], input: '' }
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`Cell ${JSON.stringify(key)} content must be an object`)
  const record = structuredClone(value) as Record<string, unknown>
  if (typeof record.input !== 'string' || !Array.isArray(record.formulaReferences))
    throw new Error(`Cell ${JSON.stringify(key)} content must contain input and FormulaReferences`)
  return {
    formulaReferences: record.formulaReferences as readonly SpreadsheetFormulaReference[],
    input: record.input,
  }
}

function cellFormat(value: unknown, key: string): SpreadsheetCellFormat {
  if (value === undefined)
    return {}
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`Cell ${JSON.stringify(key)} format must be an object`)
  return structuredClone(value) as SpreadsheetCellFormat
}

function readSheet(workbook: LoroMap, sheetId: string): SpreadsheetSheet {
  const state = sheetState(workbook, sheetId)
  const rows = readStringOrder(
    childOrder(state, SPREADSHEET_ROW_ORDER_KEY, `Sheet ${sheetId} Row order`),
    `Sheet ${sheetId} Row order`,
  ).map(id => ({ id }))
  const columns = readStringOrder(
    childOrder(state, SPREADSHEET_COLUMN_ORDER_KEY, `Sheet ${sheetId} Column order`),
    `Sheet ${sheetId} Column order`,
  ).map(id => ({ id }))
  const contents = childMap(state, SPREADSHEET_CELL_CONTENTS_KEY, `Sheet ${sheetId} Cell contents`)
  const formats = childMap(state, SPREADSHEET_CELL_FORMATS_KEY, `Sheet ${sheetId} Cell formats`)
  const keys = new Set([...Object.keys(contents.toJSON()), ...Object.keys(formats.toJSON())])
  const cells = Object.fromEntries([...keys].map((key) => {
    const content = cellContent(contents.get(key), key)
    return [key, {
      format: cellFormat(formats.get(key), key),
      formulaReferences: content.formulaReferences,
      input: content.input,
    }]
  }))
  return {
    cells,
    columns,
    id: readString(state, SPREADSHEET_SHEET_ID_KEY, `Sheet ${sheetId} id`),
    name: readString(state, SPREADSHEET_SHEET_NAME_KEY, `Sheet ${sheetId} name`),
    rows,
  }
}

export function readSpreadsheetWorkbook(runtime: EditorNoteDocument, topicId: string): SpreadsheetWorkbook {
  const workbook = workbookMap(spreadsheetNode(runtime, topicId))
  return Effect.runSync(validateSpreadsheetWorkbook({
    sheets: readStringOrder(sheetOrder(workbook), 'Workbook Sheet order')
      .map(sheetId => readSheet(workbook, sheetId)),
  }))
}

export function readSpreadsheetValidationInput(
  runtime: EditorNoteDocument,
  topicId: string,
): SpreadsheetTopicValidationInput {
  const node = spreadsheetNode(runtime, topicId)
  return {
    entry: {
      entryId: readString(node.data, ENTRY_ID_KEY, 'SpreadsheetTopic id'),
      kind: node.data.get(ENTRY_KIND_KEY),
      title: readTopicTitle(node.data, 'SpreadsheetTopic title'),
      topicType: node.data.get(TOPIC_TYPE_KEY),
    },
    workbook: readSpreadsheetWorkbook(runtime, topicId),
  }
}

function spreadsheetTopics(runtime: EditorNoteDocument): readonly SpreadsheetTopicWorkbook[] {
  return noteTree(runtime.doc).getNodes().flatMap((node) => {
    if (node.data.get(ENTRY_KIND_KEY) !== 'topic' || node.data.get(TOPIC_TYPE_KEY) !== 'spreadsheet')
      return []
    const topicId = readString(node.data, ENTRY_ID_KEY, 'SpreadsheetTopic id')
    return [{
      title: readTopicTitle(node.data, `SpreadsheetTopic ${topicId} title`),
      topicId,
      workbook: readSpreadsheetWorkbook(runtime, topicId),
    }]
  })
}

export function projectSpreadsheetWorkbook(
  runtime: EditorNoteDocument,
  topicId: string,
): SpreadsheetWorkbookProjection {
  const normalizedTopicId = normalizeNonEmptyString(topicId, 'SpreadsheetTopic id')
  spreadsheetNode(runtime, normalizedTopicId)
  const projection = evaluateSpreadsheetWorkbooks(spreadsheetTopics(runtime)).get(normalizedTopicId)
  if (!projection)
    throw new Error(`SpreadsheetTopic ${normalizedTopicId} is missing its Workbook projection`)
  return projection
}

export function projectSpreadsheetContent(
  runtime: EditorNoteDocument,
  topicId: string,
): TopicContentProjection {
  const normalizedTopicId = normalizeNonEmptyString(topicId, 'SpreadsheetTopic id')
  const node = spreadsheetNode(runtime, normalizedTopicId)
  return {
    blocks: [],
    title: readTopicTitle(node.data, `SpreadsheetTopic ${normalizedTopicId} title`),
    topicId: normalizedTopicId,
  }
}

function initializeSheet(workbook: LoroMap, sheet: SpreadsheetSheet): void {
  sheetOrder(workbook).push(sheet.id)
  const state = sheetsMap(workbook).ensureMergeableMap(sheet.id)
  state.set(SPREADSHEET_SHEET_ID_KEY, sheet.id)
  state.set(SPREADSHEET_SHEET_NAME_KEY, sheet.name)
  const rows = state.ensureMergeableMovableList(SPREADSHEET_ROW_ORDER_KEY)
  sheet.rows.forEach(row => rows.push(row.id))
  const columns = state.ensureMergeableMovableList(SPREADSHEET_COLUMN_ORDER_KEY)
  sheet.columns.forEach(column => columns.push(column.id))
  state.ensureMergeableMap(SPREADSHEET_CELL_CONTENTS_KEY)
  state.ensureMergeableMap(SPREADSHEET_CELL_FORMATS_KEY)
}

export function createSpreadsheetNode(
  doc: LoroDoc,
  input: CreateSpreadsheetTopicInput,
  parentNodeId?: Parameters<ReturnType<LoroDoc['getTree']>['createNode']>[0],
): string {
  const entryId = crypto.randomUUID()
  const rowCount = normalizeDimension(input.rowCount, defaultSpreadsheetRowCount, 'Spreadsheet Row count')
  const columnCount = normalizeDimension(input.columnCount, defaultSpreadsheetColumnCount, 'Spreadsheet Column count')
  const initialSheet: SpreadsheetSheet = {
    cells: {},
    columns: Array.from({ length: columnCount }, () => ({ id: crypto.randomUUID() })),
    id: crypto.randomUUID(),
    name: 'Sheet 1',
    rows: Array.from({ length: rowCount }, () => ({ id: crypto.randomUUID() })),
  }
  Effect.runSync(validateSpreadsheetWorkbook({ sheets: [initialSheet] }))

  const node = noteTree(doc).createNode(parentNodeId, resolveNoteEntryIndex(input.index))
  node.data.set(ENTRY_ID_KEY, entryId)
  node.data.set(ENTRY_KIND_KEY, 'topic')
  node.data.set(TOPIC_TYPE_KEY, 'spreadsheet')
  node.data.set(TOPIC_TITLE_KEY, normalizeTopicTitle(input.title))
  const workbook = node.data.ensureMergeableMap(SPREADSHEET_WORKBOOK_KEY)
  workbook.ensureMergeableMovableList(SPREADSHEET_SHEET_ORDER_KEY)
  workbook.ensureMergeableMap(SPREADSHEET_SHEETS_KEY)
  initializeSheet(workbook, initialSheet)
  return entryId
}

function findSheet(workbook: SpreadsheetWorkbook, sheetId: string): SpreadsheetSheet {
  const sheet = workbook.sheets.find(candidate => candidate.id === sheetId)
  if (!sheet)
    throw new Error(`Workbook does not contain Sheet ${sheetId}`)
  return sheet
}

function assertCellIdentity(sheet: SpreadsheetSheet, rowId: string, columnId: string): void {
  if (!sheet.rows.some(row => row.id === rowId))
    throw new Error(`Sheet ${sheet.id} does not contain Row ${rowId}`)
  if (!sheet.columns.some(column => column.id === columnId))
    throw new Error(`Sheet ${sheet.id} does not contain Column ${columnId}`)
}

function normalizeCellFormat(value: SpreadsheetCellFormat): SpreadsheetCellFormat {
  return Effect.runSync(Schema.decodeUnknownEffect(SpreadsheetCellFormatSchema)(value, {
    errors: 'all',
    onExcessProperty: 'error',
  }))
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function prepareSpreadsheetEdits(
  runtime: EditorNoteDocument,
  topicId: string,
  edits: readonly SpreadsheetEdit[],
): { edits: readonly PreparedSpreadsheetEdit[], receipt: SpreadsheetEditReceipt } {
  if (edits.length === 0)
    throw new TypeError('Spreadsheet edits must contain at least one operation')
  const topics = spreadsheetTopics(runtime)
  const currentTopic = topics.find(topic => topic.topicId === topicId)
  if (!currentTopic)
    throw new Error(`Note does not contain SpreadsheetTopic ${topicId}`)
  let workbook = structuredClone(currentTopic.workbook)
  const prepared: PreparedSpreadsheetEdit[] = []
  const changedCellKeys = new Set<string>()
  const changedSheetIds = new Set<string>()

  for (const edit of edits) {
    if (edit.type === 'set-cell-input') {
      const sheet = findSheet(workbook, edit.sheetId)
      assertCellIdentity(sheet, edit.rowId, edit.columnId)
      const contextTopics = topics.map(topic => topic.topicId === topicId ? { ...topic, workbook } : topic)
      const content = bindSpreadsheetCellInput(edit.input, {
        currentSheetId: edit.sheetId,
        currentTopicId: topicId,
        topics: contextTopics,
      })
      const key = spreadsheetCellKey(edit.rowId, edit.columnId)
      const previous = sheet.cells[key]
      if (previous && previous.input === content.input && sameValue(previous.formulaReferences, content.formulaReferences))
        continue
      const nextCell: SpreadsheetCell = {
        format: previous?.format ?? {},
        formulaReferences: content.formulaReferences,
        input: content.input,
      }
      workbook = {
        sheets: workbook.sheets.map(candidate => candidate.id === edit.sheetId
          ? { ...candidate, cells: { ...candidate.cells, [key]: nextCell } }
          : candidate),
      }
      prepared.push({ ...edit, content })
      changedCellKeys.add(`${edit.sheetId}\0${key}`)
      changedSheetIds.add(edit.sheetId)
      continue
    }

    if (edit.type === 'set-cell-format') {
      const sheet = findSheet(workbook, edit.sheetId)
      assertCellIdentity(sheet, edit.rowId, edit.columnId)
      const format = normalizeCellFormat(edit.format)
      const key = spreadsheetCellKey(edit.rowId, edit.columnId)
      const previous = sheet.cells[key]
      if (sameValue(previous?.format ?? {}, format))
        continue
      const nextCell: SpreadsheetCell = {
        format,
        formulaReferences: previous?.formulaReferences ?? [],
        input: previous?.input ?? '',
      }
      workbook = {
        sheets: workbook.sheets.map(candidate => candidate.id === edit.sheetId
          ? { ...candidate, cells: { ...candidate.cells, [key]: nextCell } }
          : candidate),
      }
      prepared.push({ ...edit, format })
      changedCellKeys.add(`${edit.sheetId}\0${key}`)
      changedSheetIds.add(edit.sheetId)
      continue
    }

    if (edit.type === 'add-sheet') {
      const sheet: SpreadsheetSheet = {
        cells: {},
        columns: structuredClone(edit.columns),
        id: normalizeNonEmptyString(edit.sheetId, 'Sheet id'),
        name: normalizeNonEmptyString(edit.name, 'Sheet name'),
        rows: structuredClone(edit.rows),
      }
      workbook = { sheets: [...workbook.sheets, sheet] }
      Effect.runSync(validateSpreadsheetWorkbook(workbook))
      prepared.push(edit)
      changedSheetIds.add(edit.sheetId)
      continue
    }

    if (edit.type === 'rename-sheet') {
      const sheet = findSheet(workbook, edit.sheetId)
      const name = normalizeNonEmptyString(edit.name, 'Sheet name')
      if (sheet.name === name)
        continue
      workbook = {
        sheets: workbook.sheets.map(candidate => candidate.id === edit.sheetId ? { ...candidate, name } : candidate),
      }
      Effect.runSync(validateSpreadsheetWorkbook(workbook))
      prepared.push({ ...edit, name })
      changedSheetIds.add(edit.sheetId)
      continue
    }

    edit satisfies never
  }
  Effect.runSync(validateSpreadsheetWorkbook(workbook))
  return {
    edits: prepared,
    receipt: {
      changedCellKeys: [...changedCellKeys].sort(),
      changedSheetIds: [...changedSheetIds].sort(),
    },
  }
}

function applyPreparedEdits(runtime: EditorNoteDocument, topicId: string, edits: readonly PreparedSpreadsheetEdit[]): void {
  const workbook = workbookMap(spreadsheetNode(runtime, topicId))
  for (const edit of edits) {
    if (edit.type === 'set-cell-input') {
      const state = sheetState(workbook, edit.sheetId)
      const contents = childMap(state, SPREADSHEET_CELL_CONTENTS_KEY, `Sheet ${edit.sheetId} Cell contents`)
      const key = spreadsheetCellKey(edit.rowId, edit.columnId)
      if (edit.content.input.length === 0 && edit.content.formulaReferences.length === 0)
        contents.delete(key)
      else
        contents.set(key, structuredClone(edit.content))
      continue
    }
    if (edit.type === 'set-cell-format') {
      const state = sheetState(workbook, edit.sheetId)
      const formats = childMap(state, SPREADSHEET_CELL_FORMATS_KEY, `Sheet ${edit.sheetId} Cell formats`)
      const key = spreadsheetCellKey(edit.rowId, edit.columnId)
      if (Object.keys(edit.format).length === 0)
        formats.delete(key)
      else
        formats.set(key, structuredClone(edit.format))
      continue
    }
    if (edit.type === 'add-sheet') {
      initializeSheet(workbook, {
        cells: {},
        columns: edit.columns,
        id: edit.sheetId,
        name: edit.name,
        rows: edit.rows,
      })
      continue
    }
    if (edit.type === 'rename-sheet') {
      sheetState(workbook, edit.sheetId).set(SPREADSHEET_SHEET_NAME_KEY, edit.name)
      continue
    }
    edit satisfies never
  }
}

export function applySpreadsheetEdits(
  runtime: EditorNoteRuntime,
  topicId: string,
  edits: readonly SpreadsheetEdit[],
): SpreadsheetEditReceipt {
  const normalizedTopicId = normalizeNonEmptyString(topicId, 'SpreadsheetTopic id')
  const prepared = prepareSpreadsheetEdits(runtime, normalizedTopicId, edits)
  if (prepared.edits.length === 0)
    return prepared.receipt
  runtime.runMutation(() => {
    applyPreparedEdits(runtime, normalizedTopicId, prepared.edits)
    readSpreadsheetWorkbook(runtime, normalizedTopicId)
    runtime.doc.commit({ origin: 'spreadsheet:apply-edits' })
  })
  return prepared.receipt
}

export function spreadsheetHasUserContent(validation: SpreadsheetTopicValidationInput): boolean {
  const workbook = Effect.runSync(validateSpreadsheetWorkbook(validation.workbook))
  return workbook.sheets.length > 1 || workbook.sheets.some(sheet => (
    Object.values(sheet.cells).some(cell => cell.input.length > 0 || Object.keys(cell.format).length > 0)
  ))
}
