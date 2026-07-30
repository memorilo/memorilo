import type { EditorStorage, NoteEntryProjection, StoredNote, TopicContentProjection as StoredTopicContentProjection } from '@memorilo/editor-storage'
import type { EditorNote, EditorNoteMutation, NoteEntrySnapshot, TopicContentProjection } from '@memorilo/editor/note'
import { DuplicateNoteTitleError } from '@memorilo/editor-storage'
import { createEditorNote } from '@memorilo/editor/note'
import { IpcMethod, IpcService } from 'electron-ipc-decorator'

const checkpointInterval = 32

interface AuthoritativeNote {
  checkpointSequence: number
  createdAt: number
  latestSequence: number
  note: EditorNote
  updatedAt: number
}

interface SaveNoteUpdatesInput {
  noteId: string
  updates: readonly Uint8Array[]
}

interface CreateNoteInput {
  initialHeading?: string
  title?: string
}

interface RenameNoteInput {
  noteId: string
  title: string
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

async function indexNote(storage: EditorStorage, noteId: string): Promise<void> {
  let indexed: number
  do {
    indexed = await storage.indexPendingEmbeddings({ limit: 256, noteId })
  } while (indexed === 256)
}

export function createNoteService(storage: EditorStorage) {
  let authoritative: AuthoritativeNote | undefined
  let operations = Promise.resolve()
  let indexing = Promise.resolve()

  const serialize = <Result>(operation: () => Promise<Result>): Promise<Result> => {
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
    return {
      checkpointSequence,
      createdAt: stored.createdAt,
      latestSequence,
      note,
      updatedAt,
    }
  }

  const load = async (stored: StoredNote, initialTopicHeading?: string): Promise<AuthoritativeNote> => {
    if (authoritative?.note.id === stored.id && authoritative.latestSequence === stored.latestSequence)
      return authoritative
    authoritative = await restore(stored, initialTopicHeading)
    return authoritative
  }

  const openNote = async (noteId: string): Promise<AuthoritativeNote> => {
    return load(await storage.getNote({ noteId }))
  }

  const toDesktopNote = (current: AuthoritativeNote) => ({
    createdAt: current.createdAt,
    id: current.note.id,
    snapshot: current.note.exportSnapshot(),
    title: current.note.getTitle(),
    updatedAt: current.updatedAt,
  })

  const toDesktopNoteSummary = (current: AuthoritativeNote) => ({
    createdAt: current.createdAt,
    id: current.note.id,
    title: current.note.getTitle(),
    updatedAt: current.updatedAt,
  })

  const checkpointIfNeeded = async (current: AuthoritativeNote): Promise<void> => {
    if (current.latestSequence - current.checkpointSequence < checkpointInterval)
      return
    const checkpoint = await storage.checkpointNote({
      noteId: current.note.id,
      snapshot: current.note.exportSnapshot(),
      throughSequence: current.latestSequence,
    })
    current.checkpointSequence = current.latestSequence
    current.updatedAt = checkpoint.updatedAt
  }

  class NoteService extends IpcService {
    static override readonly groupName = 'notes'

    @IpcMethod()
    createNote(input?: CreateNoteInput) {
      return serialize(async () => {
        const stored = input?.title === undefined
          ? await storage.createNote()
          : await storage.createNote({ title: input.title })
        const current = await load(stored, input?.initialHeading)
        return toDesktopNote(current)
      })
    }

    @IpcMethod()
    getNote(input: Parameters<EditorStorage['getNote']>[0]) {
      return serialize(async () => toDesktopNote(await openNote(input.noteId)))
    }

    @IpcMethod()
    getTopicBlock(input: Parameters<EditorStorage['getTopicBlock']>[0]) {
      return storage.getTopicBlock(input)
    }

    @IpcMethod()
    listNotes(input?: Parameters<EditorStorage['listNotes']>[0]) {
      return storage.listNotes(input)
    }

    @IpcMethod()
    openMostRecentNote() {
      return serialize(async () => {
        const current = await load(await storage.openMostRecentNote())
        return toDesktopNote(current)
      })
    }

    @IpcMethod()
    renameNote(input: RenameNoteInput) {
      return serialize(async () => {
        const current = await openNote(input.noteId)
        const title = input.title.trim()
        if (title === current.note.getTitle())
          return { note: toDesktopNoteSummary(current), status: 'renamed' } as const

        try {
          const version = current.note.getVersion()
          current.note.renameNote(title)
          const receipt = await storage.saveNoteUpdates({
            noteId: current.note.id,
            title: current.note.getTitle(),
            topics: [],
            updates: [current.note.exportUpdates(version)],
          })
          current.latestSequence = receipt.latestSequence
          current.updatedAt = receipt.updatedAt
          await checkpointIfNeeded(current)
          return { note: toDesktopNoteSummary(current), status: 'renamed' } as const
        }
        catch (error) {
          authoritative = undefined
          if (error instanceof DuplicateNoteTitleError)
            return { status: 'duplicate-title' } as const
          throw error
        }
      })
    }

    @IpcMethod()
    saveNoteUpdates(input: SaveNoteUpdatesInput) {
      return serialize(async () => {
        const current = await openNote(input.noteId)
        if (input.updates.length === 0)
          throw new TypeError('Note updates must contain at least one update')

        const changed = {
          entriesChanged: false,
          metadataChanged: false,
          topicIds: new Set<string>(),
        }
        try {
          input.updates.forEach(update => mergeMutation(changed, current.note.importUpdates(update)))
          const entries = changed.entriesChanged ? current.note.getEntries() : undefined
          const topicEntries = new Set((entries ?? current.note.getEntries())
            .filter(entry => entry.kind === 'topic')
            .map(entry => entry.id))
          const topics = [...changed.topicIds]
            .filter(topicId => topicEntries.has(topicId))
            .map(topicId => toStoredTopic(current.note.getTopicContent(topicId)))
          const receipt = await storage.saveNoteUpdates({
            ...(entries ? { entries: toStoredEntries(entries) } : {}),
            noteId: current.note.id,
            ...(changed.metadataChanged ? { title: current.note.getTitle() } : {}),
            topics,
            updates: input.updates,
          })
          current.latestSequence = receipt.latestSequence
          current.updatedAt = receipt.updatedAt

          await checkpointIfNeeded(current)
          scheduleIndex(current.note.id)
          return { updatedAt: current.updatedAt }
        }
        catch (error) {
          authoritative = undefined
          throw error
        }
      })
    }

    @IpcMethod()
    searchNotes(input: Parameters<EditorStorage['searchNotes']>[0]) {
      return storage.searchNotes(input)
    }

    @IpcMethod()
    searchTopicBlocks(input: Parameters<EditorStorage['searchTopicBlocks']>[0]) {
      return storage.searchTopicBlocks(input)
    }
  }

  return NoteService
}
