import type { EditorStorage, JournalDate } from '@memorilo/editor-storage'
import type { ActiveReadingRegistry } from '../reading/active-reading-registry'
import type {
  NoteApplicationServiceOptions,
  NoteExternalUpdate,
} from './note-application-contracts'
import { assertJournalDate } from '@memorilo/editor-storage'
import { createNoteApplicationCommands } from './note-application-commands'
import { createNoteApplicationQueries } from './note-application-queries'
import { createNoteAuthoritativeRuntime, NoteApplicationServiceClosedError } from './note-authoritative-runtime'

export { NoteApplicationServiceClosedError }
export {
  NoteCardProjectionNotFoundError,
  NoteRevisionConflictError,
} from './note-application-contracts'
export type {
  ApplicationNoteDocument,
  ApplyTopicEditsInput,
  BookTopicReadingContext,
  CreateBookNoteInput,
  CreateBookNoteResult,
  CreateNoteInput,
  GetNoteCardProjectionInput,
  ListJournalDatesInput,
  ListPastJournalsInput,
  NoteApplicationServiceOptions,
  NoteCardProjection,
  NoteExternalUpdate,
  OpenJournalInput,
  RebindBookTopicInput,
  RenameNoteInput,
  RenameTopicInput,
  SaveNoteUpdatesInput,
  SetTopicModeInput,
} from './note-application-contracts'
export { ActiveReadingDeletionError } from './note-entry-protection'

function localJournalDate(value: Date): JournalDate {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime()))
    throw new TypeError('Journal clock must return a valid Date')
  const journalDate = [
    String(value.getFullYear()).padStart(4, '0'),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0'),
  ].join('-')
  assertJournalDate(journalDate, 'Local Journal date')
  return journalDate
}

export function createNoteApplicationService(
  storage: EditorStorage,
  onExternalUpdate?: (update: NoteExternalUpdate) => void,
  options: NoteApplicationServiceOptions = {},
  activeReadings?: ActiveReadingRegistry,
) {
  const today = (): JournalDate => localJournalDate(options.now?.() ?? new Date())
  const runtime = createNoteAuthoritativeRuntime({ activeReadings, onExternalUpdate, storage, today })
  return {
    close: runtime.close,
    ...createNoteApplicationQueries({ runtime, storage, today }),
    ...createNoteApplicationCommands({ runtime, storage, today }),
  }
}

export type NoteApplicationService = ReturnType<typeof createNoteApplicationService>
