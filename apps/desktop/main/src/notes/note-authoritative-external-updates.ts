import type { EditorStorage } from '@memorilo/editor-storage'
import type { ActiveReadingRegistry } from '../reading/active-reading-registry'
import type { SaveNoteUpdatesInput } from './note-application-contracts'
import type { AuthoritativeNote, NoteAuthoritativeCache } from './note-authoritative-cache'
import { resolveJournalTopic } from '@memorilo/editor/note'
import { Effect } from 'effect'
import { projectNoteAssetReferences } from '../assets/asset-references'
import {
  mergeMutation,
  toStoredEntries,
  toStoredSpreadsheets,
  toStoredTopic,
  updateHash,
} from './note-authoritative-projection'
import {
  assertProtectedReadingEntriesRemain,
  protectedReadingEntryIds,
} from './note-entry-protection'
import { projectNoteLearningCards } from './note-learning-cards'

interface NoteAuthoritativeExternalUpdatesDependencies {
  activeReadings?: ActiveReadingRegistry
  cache: NoteAuthoritativeCache
  onExternalUpdate?: (update: { noteId: string, update: Uint8Array, updatedAt: number }) => void
  open: (noteId: string) => Promise<AuthoritativeNote>
  scheduleIndex: (noteId: string) => void
  storage: EditorStorage
}

export function createNoteAuthoritativeExternalUpdates({
  activeReadings,
  cache,
  onExternalUpdate,
  open,
  scheduleIndex,
  storage,
}: NoteAuthoritativeExternalUpdatesDependencies): (
  input: SaveNoteUpdatesInput,
) => Effect.Effect<{ updatedAt: number }, unknown> {
  return input => Effect.gen(function* () {
    const current = yield* Effect.tryPromise({ catch: error => error, try: () => open(input.noteId) })
    if (input.updates.length === 0)
      return yield* Effect.fail(new TypeError('Note updates must contain at least one update'))
    const protectedEntryIds = protectedReadingEntryIds(
      current.note.getEntries(),
      activeReadings?.topicIdsForNote(input.noteId) ?? new Set(),
    )
    const changed = { entriesChanged: false, metadataChanged: false, topicIds: new Set<string>() }

    return yield* Effect.gen(function* () {
      const projectedEntries = yield* Effect.try({
        catch: error => error,
        try: () => {
          input.updates.forEach(update => mergeMutation(changed, current.note.importUpdates(update)))
          const entries = current.note.getEntries()
          assertProtectedReadingEntriesRemain(protectedEntryIds, entries)
          return entries
        },
      })
      yield* Effect.forEach(
        projectedEntries,
        entry => entry.kind === 'topic' ? current.note.validateTopic(entry.id) : Effect.void,
        { discard: true },
      )
      const projection = yield* Effect.try({
        catch: error => error,
        try: () => {
          const journalTopic = current.journalDate === null
            ? null
            : resolveJournalTopic(current.note, { expectedNoteTitle: current.journalDate })
          const entries = changed.entriesChanged || journalTopic !== null ? projectedEntries : undefined
          const topicEntries = new Set(projectedEntries
            .filter(entry => entry.kind === 'topic')
            .map(entry => entry.id))
          const topics = (journalTopic === null ? [...changed.topicIds] : [journalTopic.topicId])
            .filter(topicId => topicEntries.has(topicId))
            .map(topicId => toStoredTopic(current.note.getTopicContent(topicId)))
          const spreadsheetTopicIds = entries === undefined ? changed.topicIds : undefined
          return {
            assetReferences: projectNoteAssetReferences(current.note),
            entries,
            journalTopic,
            learningCards: entries === undefined
              ? projectNoteLearningCards(current.note, changed.topicIds)
              : projectNoteLearningCards(current.note),
            spreadsheets: toStoredSpreadsheets(current.note, spreadsheetTopicIds),
            topics,
          }
        },
      })
      const receipt = yield* Effect.tryPromise({
        catch: error => error,
        try: () => storage.notes.saveNoteUpdates({
          allowedMissingAssetFileNames: projection.assetReferences.map(reference => reference.fileName),
          assetReferences: projection.assetReferences,
          ...(projection.entries ? { entries: toStoredEntries(projection.entries) } : {}),
          ...(projection.journalTopic === null ? {} : { journalHasUserContent: current.note.hasUserContent() }),
          learningCards: projection.learningCards,
          noteId: current.note.id,
          spreadsheets: projection.spreadsheets,
          ...(changed.metadataChanged || projection.journalTopic !== null ? { title: current.note.getTitle() } : {}),
          topics: projection.topics,
          updates: input.updates,
        }),
      })
      current.latestSequence = receipt.latestSequence
      current.updatedAt = receipt.updatedAt
      yield* Effect.tryPromise({ catch: error => error, try: () => cache.checkpointIfNeeded(current) })
      const acceptedHashes = new Set(receipt.acceptedUpdateHashes)
      if (acceptedHashes.size > 0)
        scheduleIndex(current.note.id)
      if (onExternalUpdate) {
        for (const update of input.updates) {
          const hash = updateHash(update)
          if (!acceptedHashes.delete(hash))
            continue
          try {
            onExternalUpdate({ noteId: current.note.id, update, updatedAt: current.updatedAt })
          }
          catch (error) {
            console.error(`Failed to broadcast persisted update for Note ${current.note.id}`, error)
          }
        }
      }
      return { updatedAt: current.updatedAt }
    }).pipe(Effect.catchEager((error) => {
      cache.invalidate(input.noteId)
      return Effect.fail(error)
    }))
  })
}
