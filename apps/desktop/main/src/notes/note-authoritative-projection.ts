import type {
  NoteEntryProjection,
  SpreadsheetProjection,
  TopicContentProjection as StoredTopicContentProjection,
} from '@memorilo/editor-storage'
import type {
  EditorNote,
  EditorNoteMutation,
  EditorNoteVersion,
  NoteEntrySnapshot,
  TopicContentProjection,
} from '@memorilo/editor/note'
import { createHash } from 'node:crypto'
import { spreadsheetCellKey } from '@memorilo/spreadsheet/model'

export function mergeMutation(target: {
  entriesChanged: boolean
  metadataChanged: boolean
  topicIds: Set<string>
}, mutation: EditorNoteMutation): void {
  target.entriesChanged ||= mutation.entriesChanged
  target.metadataChanged ||= mutation.metadataChanged
  mutation.topicIds.forEach(topicId => target.topicIds.add(topicId))
}

export function toStoredEntries(entries: readonly NoteEntrySnapshot[]): readonly NoteEntryProjection[] {
  return entries.map(entry => structuredClone(entry))
}

export function toStoredTopic(topic: TopicContentProjection): StoredTopicContentProjection {
  return structuredClone(topic)
}

export function toStoredSpreadsheets(
  note: Pick<EditorNote, 'getEntries' | 'getSpreadsheetTopic'>,
  topicIds?: ReadonlySet<string>,
): readonly SpreadsheetProjection[] {
  return note.getEntries().flatMap((entry) => {
    if (entry.kind !== 'topic'
      || entry.topicType !== 'spreadsheet'
      || (topicIds !== undefined && !topicIds.has(entry.id))) {
      return []
    }
    const workbook = note.getSpreadsheetTopic(entry.id).getWorkbook()
    return [{
      sheets: workbook.sheets.map(sheet => ({
        cells: sheet.rows.flatMap(row => sheet.columns.flatMap((column) => {
          const cell = sheet.cells[spreadsheetCellKey(row.id, column.id)]
          return cell === undefined
            ? []
            : [{ ...structuredClone(cell), columnId: column.id, rowId: row.id }]
        })),
        columnIds: sheet.columns.map(column => column.id),
        id: sheet.id,
        name: sheet.name,
        rowIds: sheet.rows.map(row => row.id),
      })),
      topicId: entry.id,
    }]
  })
}

export function updateHash(update: Uint8Array): string {
  return createHash('sha256').update(update).digest('hex')
}

export function noteRevision(version: readonly EditorNoteVersion[]): string {
  const normalized = [...version]
    .sort((left, right) => left.peer.localeCompare(right.peer) || left.counter - right.counter)
    .map(item => `${item.peer}:${item.counter}`)
    .join(',')
  return createHash('sha256').update(normalized).digest('hex')
}
