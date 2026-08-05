import type { EditorStorage, NoteEntryProjection, StoredNote, TopicContentProjection as StoredTopicContentProjection } from '@memorilo/editor-storage'
import type {
  EditorNote,
  EditorNoteMutation,
  EditorNoteVersion,
  NoteEntrySnapshot,
  TopicBlockEdit,
  TopicContentProjection,
} from '@memorilo/editor/note'
import type { BookFileBinding, BookReadingState } from '@memorilo/reading-model'
import type { ActiveReadingRegistry } from '../reading/active-reading-registry'
import { createHash, randomUUID } from 'node:crypto'
import { DuplicateNoteTitleError } from '@memorilo/editor-storage'
import { createEditorNote } from '@memorilo/editor/note'
import { Effect } from 'effect'

import { projectNoteAssetReferences } from '../assets/asset-references'

const checkpointInterval = 32
const noteCacheCapacity = 32

interface AuthoritativeNote {
  checkpointSequence: number
  createdAt: number
  latestSequence: number
  note: EditorNote
  updatedAt: number
}

export interface CreateNoteInput {
  initialHeading?: string
  title?: string
}

export interface CreateBookNoteInput {
  book: BookFileBinding
  noteTitle: string
  topicTitle: string
}

export interface ApplicationNoteDocument {
  createdAt: number
  favorite: boolean
  id: string
  snapshot: Uint8Array
  title: string
  updatedAt: number
}

export interface BookTopicReadingContext {
  book: BookFileBinding
  note: ApplicationNoteDocument
  readingState: BookReadingState
  topicId: string
  topicTitle: string
}

export type CreateBookNoteResult
  = | { context: BookTopicReadingContext, status: 'created' }
    | { status: 'duplicate-title' }

export interface RenameNoteInput {
  noteId: string
  title: string
}

export interface SaveNoteUpdatesInput {
  noteId: string
  updates: readonly Uint8Array[]
}

export interface ApplyTopicEditsInput {
  edits: readonly TopicBlockEdit[]
  expectedRevision: string
  noteId: string
  topicId: string
}

export interface RenameTopicInput {
  expectedRevision: string
  noteId: string
  title: string
  topicId: string
}

export interface SetTopicModeInput {
  expectedRevision: string
  mode: 0 | 1
  noteId: string
  topicId: string
}

export interface RebindBookTopicInput {
  book: BookFileBinding
  noteId: string
  topicId: string
}

export interface NoteExternalUpdate {
  noteId: string
  update: Uint8Array
  updatedAt: number
}

export class NoteApplicationServiceClosedError extends Error {
  override readonly name = 'NoteApplicationServiceClosedError'

  constructor() {
    super('The Note application service is closing')
  }
}

export class NoteRevisionConflictError extends Error {
  override readonly name = 'NoteRevisionConflictError'

  constructor(readonly currentRevision: string) {
    super('The Note changed after it was read')
  }
}

export class ActiveReadingDeletionError extends Error {
  override readonly name = 'ActiveReadingDeletionError'

  constructor(readonly entryId: string) {
    super(`Note entry ${entryId} cannot be deleted while its BookTopic is open in a reader`)
  }
}

function mergeMutation(target: {
  entriesChanged: boolean
  metadataChanged: boolean
  topicIds: Set<string>
}, mutation: EditorNoteMutation): void {
  target.entriesChanged ||= mutation.entriesChanged
  target.metadataChanged ||= mutation.metadataChanged
  mutation.topicIds.forEach(topicId => target.topicIds.add(topicId))
}

function toStoredEntries(entries: readonly NoteEntrySnapshot[]): readonly NoteEntryProjection[] {
  return entries.map(entry => structuredClone(entry))
}

function toStoredTopic(topic: TopicContentProjection): StoredTopicContentProjection {
  return structuredClone(topic)
}

function updateHash(update: Uint8Array): string {
  return createHash('sha256').update(update).digest('hex')
}

function noteRevision(version: readonly EditorNoteVersion[]): string {
  const normalized = [...version]
    .sort((left, right) => left.peer.localeCompare(right.peer) || left.counter - right.counter)
    .map(item => `${item.peer}:${item.counter}`)
    .join(',')
  return createHash('sha256').update(normalized).digest('hex')
}

function protectedReadingEntryIds(
  entries: readonly NoteEntrySnapshot[],
  activeTopicIds: ReadonlySet<string>,
): ReadonlySet<string> {
  if (activeTopicIds.size === 0)
    return new Set()
  const entriesById = new Map(entries.map(entry => [entry.id, entry]))
  const protectedIds = new Set<string>()
  for (const topicId of activeTopicIds) {
    let current = entriesById.get(topicId)
    if (!current)
      throw new Error(`Active BookTopic ${topicId} is missing from its Note`)
    while (current) {
      protectedIds.add(current.id)
      if (current.parentId === null)
        break
      const parent = entriesById.get(current.parentId)
      if (!parent)
        throw new Error(`Note entry ${current.id} has unknown parent ${current.parentId}`)
      current = parent
    }
  }
  return protectedIds
}

function assertProtectedReadingEntriesRemain(
  protectedIds: ReadonlySet<string>,
  entries: readonly NoteEntrySnapshot[],
): void {
  if (protectedIds.size === 0)
    return
  const remainingIds = new Set(entries.map(entry => entry.id))
  for (const entryId of protectedIds) {
    if (!remainingIds.has(entryId))
      throw new ActiveReadingDeletionError(entryId)
  }
}

async function indexNote(storage: EditorStorage, noteId: string): Promise<void> {
  let indexed: number
  do {
    indexed = await storage.indexPendingEmbeddings({ limit: 256, noteId })
  } while (indexed === 256)
}

export function createNoteApplicationService(
  storage: EditorStorage,
  onExternalUpdate?: (update: NoteExternalUpdate) => void,
  activeReadings?: ActiveReadingRegistry,
) {
  const cache = new Map<string, AuthoritativeNote>()
  let operations = Promise.resolve()
  let indexing = Promise.resolve()
  let closePromise: Promise<void> | null = null
  let closing = false

  const serialize = <Result>(operation: () => Promise<Result>): Promise<Result> => {
    if (closing)
      return Promise.reject(new NoteApplicationServiceClosedError())
    const result = operations.then(operation)
    operations = result.then(() => undefined, () => undefined)
    return result
  }

  const scheduleIndex = (noteId: string) => {
    indexing = indexing
      .then(() => indexNote(storage, noteId))
      .catch(error => console.error(`Failed to index Note ${noteId}`, error))
  }

  const restore = async (stored: StoredNote, initialTopicHeading?: string): Promise<AuthoritativeNote> => {
    const note = createEditorNote({
      id: stored.id,
      ...(initialTopicHeading === undefined ? {} : { initialTopicHeading }),
      snapshot: stored.snapshot,
      title: stored.title,
      updates: stored.updates.map(update => update.update),
    })
    let checkpointSequence = stored.checkpointSequence
    let latestSequence = stored.latestSequence
    let updatedAt = stored.updatedAt
    if (stored.snapshot === null) {
      if (stored.updates.length === 0) {
        const entries = note.getEntries()
        const initialized = await storage.saveNoteUpdates({
          entries: toStoredEntries(entries),
          noteId: note.id,
          title: note.getTitle(),
          topics: entries
            .filter(entry => entry.kind === 'topic')
            .map(entry => toStoredTopic(note.getTopicContent(entry.id))),
          updates: [note.exportUpdates()],
        })
        latestSequence = initialized.latestSequence
        updatedAt = initialized.updatedAt
      }
      const checkpoint = await storage.checkpointNote({
        noteId: stored.id,
        snapshot: note.exportSnapshot(),
        throughSequence: latestSequence,
      })
      checkpointSequence = latestSequence
      updatedAt = checkpoint.updatedAt
    }
    const assetReferences = projectNoteAssetReferences(note)
    await storage.reconcileNoteAssetReferences({
      allowedMissingAssetFileNames: assetReferences.map(reference => reference.fileName),
      expectedLatestSequence: latestSequence,
      noteId: note.id,
      references: assetReferences,
    })
    return { checkpointSequence, createdAt: stored.createdAt, latestSequence, note, updatedAt }
  }

  const checkpoint = async (current: AuthoritativeNote): Promise<void> => {
    if (current.latestSequence === current.checkpointSequence)
      return
    try {
      const receipt = await storage.checkpointNote({
        noteId: current.note.id,
        snapshot: current.note.exportSnapshot(),
        throughSequence: current.latestSequence,
      })
      current.checkpointSequence = current.latestSequence
      current.updatedAt = receipt.updatedAt
    }
    catch (error) {
      console.error(`Failed to checkpoint Note ${current.note.id}; the persisted update log remains authoritative`, error)
    }
  }

  const cacheNote = async (current: AuthoritativeNote): Promise<AuthoritativeNote> => {
    cache.delete(current.note.id)
    cache.set(current.note.id, current)
    if (cache.size <= noteCacheCapacity)
      return current

    const leastRecentlyUsedId = cache.keys().next().value
    if (leastRecentlyUsedId === undefined)
      return current
    const leastRecentlyUsed = cache.get(leastRecentlyUsedId)
    cache.delete(leastRecentlyUsedId)
    if (leastRecentlyUsed)
      await checkpoint(leastRecentlyUsed)
    return current
  }

  const load = async (stored: StoredNote, initialTopicHeading?: string): Promise<AuthoritativeNote> => {
    const cached = cache.get(stored.id)
    if (cached && cached.latestSequence === stored.latestSequence)
      return cacheNote(cached)
    if (cached) {
      cache.delete(stored.id)
      await checkpoint(cached)
    }
    return cacheNote(await restore(stored, initialTopicHeading))
  }

  const openNote = async (noteId: string): Promise<AuthoritativeNote> => {
    const cached = cache.get(noteId)
    if (cached)
      return cacheNote(cached)
    return load(await storage.getNote({ noteId }))
  }

  const invalidate = (noteId: string): void => {
    cache.delete(noteId)
  }

  const toDesktopNote = async (current: AuthoritativeNote) => {
    const favorite = await storage.getNoteFavorite({ noteId: current.note.id })
    return {
      createdAt: current.createdAt,
      favorite: favorite.favorite,
      id: current.note.id,
      snapshot: current.note.exportSnapshot(),
      title: current.note.getTitle(),
      updatedAt: current.updatedAt,
    }
  }

  const toBookTopicReadingContext = async (
    current: AuthoritativeNote,
    topicId: string,
  ): Promise<BookTopicReadingContext> => {
    const entry = current.note.getEntries().find(candidate => candidate.id === topicId)
    if (!entry || entry.kind !== 'topic' || entry.topicType !== 'book')
      throw new Error(`Note ${current.note.id} does not contain BookTopic ${topicId}`)
    const topic = current.note.getBookTopic(topicId)
    return {
      book: topic.getBook(),
      note: await toDesktopNote(current),
      readingState: topic.getReadingState(),
      topicId,
      topicTitle: entry.title,
    }
  }

  const toDesktopNoteSummary = async (current: AuthoritativeNote) => {
    const favorite = await storage.getNoteFavorite({ noteId: current.note.id })
    return {
      createdAt: current.createdAt,
      favorite: favorite.favorite,
      id: current.note.id,
      title: current.note.getTitle(),
      updatedAt: current.updatedAt,
    }
  }

  const checkpointIfNeeded = async (current: AuthoritativeNote): Promise<void> => {
    if (current.latestSequence - current.checkpointSequence >= checkpointInterval)
      await checkpoint(current)
  }

  const persistLocalMutation = async (
    current: AuthoritativeNote,
    version: readonly EditorNoteVersion[],
    options: { broadcast?: boolean, entries?: boolean, title?: boolean, topicIds?: readonly string[] },
  ) => {
    const update = current.note.exportUpdates(version)
    const assetReferences = projectNoteAssetReferences(current.note)
    const receipt = await storage.saveNoteUpdates({
      allowedMissingAssetFileNames: assetReferences.map(reference => reference.fileName),
      assetReferences,
      ...(options.entries ? { entries: toStoredEntries(current.note.getEntries()) } : {}),
      noteId: current.note.id,
      ...(options.title ? { title: current.note.getTitle() } : {}),
      topics: (options.topicIds ?? []).map(topicId => toStoredTopic(current.note.getTopicContent(topicId))),
      updates: [update],
    })
    current.latestSequence = receipt.latestSequence
    current.updatedAt = receipt.updatedAt
    await checkpointIfNeeded(current)
    if (receipt.acceptedUpdateHashes.length > 0)
      scheduleIndex(current.note.id)
    if (options.broadcast && receipt.acceptedUpdateHashes.length > 0 && onExternalUpdate) {
      try {
        onExternalUpdate({ noteId: current.note.id, update, updatedAt: current.updatedAt })
      }
      catch (error) {
        console.error(`Failed to broadcast persisted update for Note ${current.note.id}`, error)
      }
    }
    return { revision: noteRevision(current.note.getVersion()), updatedAt: current.updatedAt }
  }

  const assertRevision = (current: AuthoritativeNote, expectedRevision: string): void => {
    const revision = noteRevision(current.note.getVersion())
    if (revision !== expectedRevision)
      throw new NoteRevisionConflictError(revision)
  }

  const close = (): Promise<void> => {
    if (closePromise)
      return closePromise
    closing = true
    closePromise = (async () => {
      await operations
      for (const current of cache.values())
        await checkpoint(current)
      cache.clear()
      await indexing
    })()
    return closePromise
  }

  return {
    close,
    applyTopicEdits: (input: ApplyTopicEditsInput) => serialize(async () => {
      const current = await openNote(input.noteId)
      assertRevision(current, input.expectedRevision)
      const version = current.note.getVersion()
      try {
        current.note.applyTopicBlockEdits({ edits: input.edits, topicId: input.topicId })
        await Effect.runPromise(current.note.validateTopic(input.topicId))
        return await persistLocalMutation(current, version, { broadcast: true, topicIds: [input.topicId] })
      }
      catch (error) {
        invalidate(input.noteId)
        throw error
      }
    }),
    createNote: (input?: CreateNoteInput) => serialize(async () => {
      const stored = input?.title === undefined
        ? await storage.createNote()
        : await storage.createNote({ title: input.title })
      return toDesktopNote(await load(stored, input?.initialHeading))
    }),
    createBookNote: (input: CreateBookNoteInput) => serialize(async (): Promise<CreateBookNoteResult> => {
      const id = randomUUID()
      const note = createEditorNote({
        id,
        initialBookTopic: {
          book: input.book,
          mode: 0,
          title: input.topicTitle,
        },
        title: input.noteTitle,
      })
      const entries = note.getEntries()
      try {
        const stored = await storage.createInitializedNote({
          entries: toStoredEntries(entries),
          id,
          snapshot: note.exportSnapshot(),
          title: note.getTitle(),
          topics: entries
            .filter(entry => entry.kind === 'topic')
            .map(entry => toStoredTopic(note.getTopicContent(entry.id))),
        })
        const current = await cacheNote({
          checkpointSequence: stored.checkpointSequence,
          createdAt: stored.createdAt,
          latestSequence: stored.latestSequence,
          note,
          updatedAt: stored.updatedAt,
        })
        const topic = entries.find(entry => entry.kind === 'topic' && entry.topicType === 'book')
        if (!topic)
          throw new Error(`New Book Note ${id} does not contain its BookTopic`)
        return { context: await toBookTopicReadingContext(current, topic.id), status: 'created' }
      }
      catch (error) {
        if (error instanceof DuplicateNoteTitleError)
          return { status: 'duplicate-title' }
        throw error
      }
    }),
    getBookTopicReadingContext: (input: { noteId: string, topicId: string }) => serialize(async () => (
      toBookTopicReadingContext(await openNote(input.noteId), input.topicId)
    )),
    getNote: (input: Parameters<EditorStorage['getNote']>[0]) => serialize(async () => toDesktopNote(await openNote(input.noteId))),
    getNoteTree: (input: { noteId: string }) => serialize(async () => {
      const current = await openNote(input.noteId)
      return {
        entries: current.note.getEntries(),
        noteId: current.note.id,
        revision: noteRevision(current.note.getVersion()),
        title: current.note.getTitle(),
        updatedAt: current.updatedAt,
      }
    }),
    getTopic: (input: { noteId: string, topicId: string }) => serialize(async () => {
      const current = await openNote(input.noteId)
      const entry = current.note.getEntries().find(candidate => candidate.id === input.topicId)
      if (!entry || entry.kind !== 'topic')
        throw new Error(`Note ${input.noteId} does not contain Topic ${input.topicId}`)
      const validation = current.note.getTopicValidationInput(input.topicId)
      return {
        document: validation.document,
        mode: entry.mode,
        noteId: current.note.id,
        revision: noteRevision(current.note.getVersion()),
        title: entry.title,
        topicId: input.topicId,
        updatedAt: current.updatedAt,
      }
    }),
    getTopicBlock: (input: Parameters<EditorStorage['getTopicBlock']>[0]) => serialize(() => storage.getTopicBlock(input)),
    listFavoriteNotes: (input?: Parameters<EditorStorage['listFavoriteNotes']>[0]) => serialize(() => storage.listFavoriteNotes(input)),
    listNotes: (input?: Parameters<EditorStorage['listNotes']>[0]) => serialize(() => storage.listNotes(input)),
    listRecentNotes: (input?: Parameters<EditorStorage['listRecentNotes']>[0]) => serialize(() => storage.listRecentNotes(input)),
    openMostRecentNote: () => serialize(async () => toDesktopNote(await load(await storage.openMostRecentNote()))),
    recordNoteOpened: (input: Parameters<EditorStorage['recordNoteOpened']>[0]) => serialize(() => storage.recordNoteOpened(input)),
    rebindBookTopic: (input: RebindBookTopicInput) => serialize(async () => {
      const current = await openNote(input.noteId)
      const version = current.note.getVersion()
      try {
        current.note.getBookTopic(input.topicId).rebind(input.book)
        await persistLocalMutation(current, version, {
          broadcast: true,
          entries: true,
          topicIds: [input.topicId],
        })
        return toBookTopicReadingContext(current, input.topicId)
      }
      catch (error) {
        invalidate(input.noteId)
        throw error
      }
    }),
    renameNote: (input: RenameNoteInput) => serialize(async () => {
      const current = await openNote(input.noteId)
      const title = input.title.trim()
      if (title === current.note.getTitle())
        return { note: await toDesktopNoteSummary(current), status: 'renamed' } as const
      try {
        const version = current.note.getVersion()
        current.note.renameNote(title)
        await persistLocalMutation(current, version, { title: true })
        return { note: await toDesktopNoteSummary(current), status: 'renamed' } as const
      }
      catch (error) {
        invalidate(input.noteId)
        if (error instanceof DuplicateNoteTitleError)
          return { status: 'duplicate-title' } as const
        throw error
      }
    }),
    renameTopic: (input: RenameTopicInput) => serialize(async () => {
      const current = await openNote(input.noteId)
      assertRevision(current, input.expectedRevision)
      const version = current.note.getVersion()
      try {
        current.note.renameEntry(input.topicId, input.title)
        return await persistLocalMutation(current, version, { broadcast: true, entries: true, topicIds: [input.topicId] })
      }
      catch (error) {
        invalidate(input.noteId)
        throw error
      }
    }),
    setTopicMode: (input: SetTopicModeInput) => serialize(async () => {
      const current = await openNote(input.noteId)
      assertRevision(current, input.expectedRevision)
      const version = current.note.getVersion()
      try {
        current.note.getTopic(input.topicId).setMode(input.mode)
        return await persistLocalMutation(current, version, { broadcast: true, entries: true })
      }
      catch (error) {
        invalidate(input.noteId)
        throw error
      }
    }),
    saveNoteUpdates: (input: SaveNoteUpdatesInput) => serialize(async () => {
      const current = await openNote(input.noteId)
      if (input.updates.length === 0)
        throw new TypeError('Note updates must contain at least one update')
      const protectedEntryIds = protectedReadingEntryIds(
        current.note.getEntries(),
        activeReadings?.topicIdsForNote(input.noteId) ?? new Set(),
      )
      const changed = { entriesChanged: false, metadataChanged: false, topicIds: new Set<string>() }
      try {
        input.updates.forEach(update => mergeMutation(changed, current.note.importUpdates(update)))
        const projectedEntries = current.note.getEntries()
        assertProtectedReadingEntriesRemain(protectedEntryIds, projectedEntries)
        for (const entry of projectedEntries) {
          if (entry.kind === 'topic')
            await Effect.runPromise(current.note.validateTopic(entry.id))
        }
        const entries = changed.entriesChanged ? projectedEntries : undefined
        const topicEntries = new Set(projectedEntries
          .filter(entry => entry.kind === 'topic')
          .map(entry => entry.id))
        const topics = [...changed.topicIds]
          .filter(topicId => topicEntries.has(topicId))
          .map(topicId => toStoredTopic(current.note.getTopicContent(topicId)))
        const assetReferences = projectNoteAssetReferences(current.note)
        const receipt = await storage.saveNoteUpdates({
          allowedMissingAssetFileNames: assetReferences.map(reference => reference.fileName),
          assetReferences,
          ...(entries ? { entries: toStoredEntries(entries) } : {}),
          noteId: current.note.id,
          ...(changed.metadataChanged ? { title: current.note.getTitle() } : {}),
          topics,
          updates: input.updates,
        })
        current.latestSequence = receipt.latestSequence
        current.updatedAt = receipt.updatedAt
        await checkpointIfNeeded(current)
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
      }
      catch (error) {
        invalidate(input.noteId)
        throw error
      }
    }),
    searchNotes: (input: Parameters<EditorStorage['searchNotes']>[0]) => serialize(() => storage.searchNotes(input)),
    searchTopicBlocks: (input: Parameters<EditorStorage['searchTopicBlocks']>[0]) => serialize(() => storage.searchTopicBlocks(input)),
    setNoteFavorite: (input: Parameters<EditorStorage['setNoteFavorite']>[0]) => serialize(() => storage.setNoteFavorite(input)),
  }
}

export type NoteApplicationService = ReturnType<typeof createNoteApplicationService>
