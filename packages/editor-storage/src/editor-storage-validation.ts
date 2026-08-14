import type {
  AssetReferenceProjection,
  NoteEntryProjection,
  SpreadsheetProjection,
  TopicContentProjection,
  TopicProjection,
} from './editor-storage-contracts'
import type { LearningTopicCardProjection } from './learning'
import { assertBookFileBinding, bookFileIdentityKey } from '@memorilo/reading-model'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'
import { validateAssetFileName } from './editor-asset-repository'
import { assertNonEmpty } from './editor-storage-shared'

function assertString(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string')
    throw new TypeError(`${name} must be a string`)
}

export function validateBinary(value: Uint8Array, name: string): void {
  if (!(value instanceof Uint8Array) || value.byteLength === 0)
    throw new TypeError(`${name} must be a non-empty Uint8Array`)
}

export function validateCompleteLearningProjection(
  entries: readonly NoteEntryProjection[],
  learningCards: readonly LearningTopicCardProjection[],
): void {
  const entryTopicIds = new Set(entries.flatMap(entry => entry.kind === 'topic' ? [entry.id] : []))
  const learningTopicIds = new Set(learningCards.map(topic => topic.topicId))
  if (entryTopicIds.size !== learningTopicIds.size
    || [...entryTopicIds].some(topicId => !learningTopicIds.has(topicId))) {
    throw new Error('A complete Note entry projection must include learning Cards for every Topic')
  }
}

function validateHierarchy<T extends { id: string, ordinal: number, parentId: string | null }>(
  values: readonly T[],
  description: string,
): Map<string, T> {
  const byId = new Map<string, T>()
  const siblingPositions = new Set<string>()

  for (const value of values) {
    assertNonEmpty(value.id, `${description} id`)
    if (!Number.isInteger(value.ordinal) || value.ordinal < 0)
      throw new RangeError(`${description} ${value.id} ordinal must be a non-negative integer`)
    if (byId.has(value.id))
      throw new Error(`Duplicate ${description} id: ${value.id}`)
    if (value.parentId === value.id)
      throw new Error(`${description} ${value.id} cannot be its own parent`)

    byId.set(value.id, value)
    const position = `${value.parentId ?? '<root>'}\0${value.ordinal}`
    if (siblingPositions.has(position))
      throw new Error(`Duplicate ${description} ordinal ${value.ordinal} under ${value.parentId ?? '<root>'}`)
    siblingPositions.add(position)
  }

  for (const value of values) {
    const ancestors = new Set<string>([value.id])
    let parentId = value.parentId
    while (parentId !== null) {
      if (ancestors.has(parentId))
        throw new Error(`${description} ${value.id} belongs to a parent cycle`)
      ancestors.add(parentId)
      const parent = byId.get(parentId)
      if (!parent)
        throw new Error(`${description} ${value.id} has unknown parent ${parentId}`)
      parentId = parent.parentId
    }
  }
  return byId
}

/** Validates the complete projection required by a Journal Note save. */
export function validateJournalProjection(
  entries: readonly NoteEntryProjection[] | undefined,
  topics: readonly TopicContentProjection[],
): void {
  if (entries === undefined)
    throw new TypeError('Journal saves must include the complete Note entry projection')
  if (entries.length !== 1)
    throw new TypeError('A Journal Note must contain exactly one Topic')
  const entry = entries[0]
  if (!entry || entry.kind !== 'topic' || entry.parentId !== null || entry.ordinal !== 0)
    throw new TypeError('A Journal Note must contain one root Topic at ordinal zero')
  if (topics.length !== 1 || topics[0]?.topicId !== entry.id)
    throw new TypeError('Journal saves must include the complete root Topic projection')
}

/** Validates an incremental Note projection without requiring every projection field. */
export function validateProjectionPatch(
  entries: readonly NoteEntryProjection[] | undefined,
  topics: readonly TopicContentProjection[],
  spreadsheets: readonly SpreadsheetProjection[] | undefined = undefined,
): void {
  const entriesById = entries ? validateHierarchy(entries, 'NoteEntry') : undefined
  const topicEntries = new Map<string, TopicProjection>()
  const bookTopicIdsByFile = new Map<string, string>()

  for (const entry of entries ?? []) {
    if (entry.kind === 'folder') {
      assertNonEmpty(entry.name, `Folder ${entry.id} name`)
    }
    else if (entry.kind === 'topic') {
      const entryId = entry.id
      assertString(entry.title, `Topic ${entryId} title`)
      if (entry.topicType !== 'image-occlusion'
        && entry.topicType !== 'spreadsheet'
        && entry.topicType !== 'whiteboard'
        && entry.mode !== 0
        && entry.mode !== 1) {
        throw new TypeError(`Topic ${entryId} Editor mode must be 0 (Document) or 1 (Outline)`)
      }
      if (entry.topicType === 'book') {
        assertNonEmpty(entry.title, `BookTopic ${entryId} title`)
        assertBookFileBinding(entry.book, `BookTopic ${entryId} binding`)
        const identity = bookFileIdentityKey(entry.book.file)
        const existingTopicId = bookTopicIdsByFile.get(identity)
        if (existingTopicId)
          throw new Error(`BookTopics ${existingTopicId} and ${entryId} bind the same file ${identity}`)
        bookTopicIdsByFile.set(identity, entryId)
      }
      else if (entry.topicType !== 'image-occlusion'
        && entry.topicType !== 'regular'
        && entry.topicType !== 'spreadsheet'
        && entry.topicType !== 'whiteboard') {
        throw new TypeError(`Topic ${entryId} has an unknown subtype`)
      }
      topicEntries.set(entryId, entry)
    }
    else {
      throw new TypeError(`Unknown NoteEntry kind: ${String((entry as { kind: unknown }).kind)}`)
    }
  }

  validateSpreadsheetProjections(entries, topics, spreadsheets)

  const projectedTopics = new Set<string>()
  for (const topic of topics) {
    assertNonEmpty(topic.topicId, 'Topic projection id')
    assertString(topic.title, `Topic ${topic.topicId} title`)
    if (projectedTopics.has(topic.topicId))
      throw new Error(`Duplicate Topic projection: ${topic.topicId}`)
    projectedTopics.add(topic.topicId)
    const entry = topicEntries.get(topic.topicId)
    if (entries && !entry)
      throw new Error(`Topic projection ${topic.topicId} has no matching NoteEntry`)
    if (entry && entry.title !== topic.title)
      throw new Error(`Topic projection ${topic.topicId} title does not match its NoteEntry`)

    validateHierarchy(topic.blocks, `Topic ${topic.topicId} Block`)
    for (const block of topic.blocks) {
      assertNonEmpty(block.kind, `Topic ${topic.topicId} Block ${block.id} kind`)
      if (block.attributes === null || Array.isArray(block.attributes) || typeof block.attributes !== 'object')
        throw new TypeError(`Topic ${topic.topicId} Block ${block.id} attributes must be an object`)
    }
  }

  for (const entry of entries ?? []) {
    if (entry.parentId !== null && !entriesById?.has(entry.parentId))
      throw new Error(`NoteEntry ${entry.id} has unknown parent ${entry.parentId}`)
    if (entry.kind === 'folder' && entry.parentId !== null && entriesById?.get(entry.parentId)?.kind === 'topic')
      throw new Error(`Folder ${entry.id} cannot use Topic ${entry.parentId} as its parent`)
  }
}

function validateOrderedIds(values: readonly string[], description: string): Set<string> {
  if (values.length === 0)
    throw new TypeError(`${description} must contain at least one id`)
  const ids = new Set<string>()
  values.forEach((value, index) => {
    assertNonEmpty(value, `${description} ${index}`)
    if (ids.has(value))
      throw new Error(`${description} contains duplicate id ${value}`)
    ids.add(value)
  })
  return ids
}

function validateSpreadsheetProjections(
  entries: readonly NoteEntryProjection[] | undefined,
  topics: readonly TopicContentProjection[],
  spreadsheets: readonly SpreadsheetProjection[] | undefined,
): void {
  const spreadsheetEntries = new Set((entries ?? []).flatMap(entry => (
    entry.kind === 'topic' && entry.topicType === 'spreadsheet' ? [entry.id] : []
  )))
  const projections = spreadsheets ?? []
  const projectedTopicIds = new Set<string>()

  for (const spreadsheet of projections) {
    assertNonEmpty(spreadsheet.topicId, 'SpreadsheetTopic projection id')
    if (projectedTopicIds.has(spreadsheet.topicId))
      throw new Error(`Duplicate SpreadsheetTopic projection: ${spreadsheet.topicId}`)
    projectedTopicIds.add(spreadsheet.topicId)
    if (entries && !spreadsheetEntries.has(spreadsheet.topicId)) {
      throw new Error(
        `SpreadsheetTopic projection ${spreadsheet.topicId} has no matching SpreadsheetTopic NoteEntry`,
      )
    }
    if (spreadsheet.sheets.length === 0)
      throw new TypeError(`SpreadsheetTopic ${spreadsheet.topicId} must contain at least one Sheet`)

    const sheetIds = new Set<string>()
    const sheetNames = new Set<string>()
    for (const sheet of spreadsheet.sheets) {
      assertNonEmpty(sheet.id, `SpreadsheetTopic ${spreadsheet.topicId} Sheet id`)
      assertNonEmpty(sheet.name, `SpreadsheetTopic ${spreadsheet.topicId} Sheet ${sheet.id} name`)
      if (sheetIds.has(sheet.id))
        throw new Error(`SpreadsheetTopic ${spreadsheet.topicId} contains duplicate Sheet id ${sheet.id}`)
      if (sheetNames.has(sheet.name))
        throw new Error(`SpreadsheetTopic ${spreadsheet.topicId} contains duplicate Sheet name ${sheet.name}`)
      sheetIds.add(sheet.id)
      sheetNames.add(sheet.name)
      const rowIds = validateOrderedIds(
        sheet.rowIds,
        `SpreadsheetTopic ${spreadsheet.topicId} Sheet ${sheet.id} Row order`,
      )
      const columnIds = validateOrderedIds(
        sheet.columnIds,
        `SpreadsheetTopic ${spreadsheet.topicId} Sheet ${sheet.id} Column order`,
      )
      const cellCoordinates = new Set<string>()

      for (const cell of sheet.cells) {
        assertNonEmpty(cell.rowId, `SpreadsheetTopic ${spreadsheet.topicId} Sheet ${sheet.id} Cell Row id`)
        assertNonEmpty(cell.columnId, `SpreadsheetTopic ${spreadsheet.topicId} Sheet ${sheet.id} Cell Column id`)
        if (!rowIds.has(cell.rowId))
          throw new Error(`SpreadsheetTopic ${spreadsheet.topicId} Sheet ${sheet.id} Cell uses unknown Row ${cell.rowId}`)
        if (!columnIds.has(cell.columnId)) {
          throw new Error(
            `SpreadsheetTopic ${spreadsheet.topicId} Sheet ${sheet.id} Cell uses unknown Column ${cell.columnId}`,
          )
        }
        const coordinate = `${cell.rowId}\0${cell.columnId}`
        if (cellCoordinates.has(coordinate)) {
          throw new Error(
            `SpreadsheetTopic ${spreadsheet.topicId} Sheet ${sheet.id} contains duplicate Cell ${cell.rowId}/${cell.columnId}`,
          )
        }
        cellCoordinates.add(coordinate)
        assertString(cell.input, `SpreadsheetTopic ${spreadsheet.topicId} Sheet ${sheet.id} Cell input`)
        assertString(cell.display, `SpreadsheetTopic ${spreadsheet.topicId} Sheet ${sheet.id} Cell display`)
        if (cell.format === null || Array.isArray(cell.format) || typeof cell.format !== 'object') {
          throw new TypeError(
            `SpreadsheetTopic ${spreadsheet.topicId} Sheet ${sheet.id} Cell format must be an object`,
          )
        }
        if (!Array.isArray(cell.formulaReferences)) {
          throw new TypeError(
            `SpreadsheetTopic ${spreadsheet.topicId} Sheet ${sheet.id} Cell FormulaReferences must be an array`,
          )
        }
        if (cell.formulaReferences.length > 0 && !cell.input.startsWith('=')) {
          throw new TypeError(
            `SpreadsheetTopic ${spreadsheet.topicId} Sheet ${sheet.id} Cell FormulaReferences require formula input`,
          )
        }
        let previousEnd = 0
        for (const reference of cell.formulaReferences) {
          assertNonEmpty(reference.topicId, 'FormulaReference Topic id')
          assertNonEmpty(reference.sheetId, 'FormulaReference Sheet id')
          assertNonEmpty(reference.rowId, 'FormulaReference Row id')
          assertNonEmpty(reference.columnId, 'FormulaReference Column id')
          if (!Number.isInteger(reference.sourceStart) || reference.sourceStart < previousEnd) {
            throw new RangeError('FormulaReference source ranges must be ordered, non-overlapping integers')
          }
          if (!Number.isInteger(reference.sourceEnd)
            || reference.sourceEnd <= reference.sourceStart
            || reference.sourceEnd > cell.input.length) {
            throw new RangeError('FormulaReference source range must be non-empty and inside the Cell input')
          }
          previousEnd = reference.sourceEnd
        }
      }
    }
  }

  if (entries && (
    spreadsheetEntries.size !== projectedTopicIds.size
    || [...spreadsheetEntries].some(topicId => !projectedTopicIds.has(topicId))
  )) {
    throw new Error('A complete Note entry projection must include every SpreadsheetTopic Workbook')
  }

  for (const topic of topics) {
    if (projectedTopicIds.has(topic.topicId) && topic.blocks.length > 0)
      throw new Error(`SpreadsheetTopic ${topic.topicId} must not project Topic Blocks`)
  }
}

export function contentHash(text: string): string {
  return bytesToHex(sha256(utf8ToBytes(text)))
}

export function validateAssetReferences(references: readonly AssetReferenceProjection[]): void {
  const fileNames = new Set<string>()
  for (const reference of references) {
    validateAssetFileName(reference.fileName)
    if (!Number.isInteger(reference.count) || reference.count <= 0)
      throw new RangeError('Asset reference count must be a positive integer')
    if (fileNames.has(reference.fileName))
      throw new TypeError(`Duplicate asset reference: ${reference.fileName}`)
    fileNames.add(reference.fileName)
  }
}
