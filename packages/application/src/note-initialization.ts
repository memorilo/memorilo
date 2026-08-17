import type { EditorStorage, StoredNote } from '@memorilo/editor-storage'
import type { CreateBookTopicInput, EditorNote } from '@memorilo/editor/note'
import { createEditorNote } from '@memorilo/editor/note'
import { projectEditorNoteStorage } from './note-storage'

export interface CreateBookEditorNoteInput {
  book: CreateBookTopicInput['book']
  id: string
  learningEnabled: boolean
  noteTitle: string
  topicTitle: string
}

export interface CreatedBookEditorNote {
  note: EditorNote
  topicId: string
}

export function createBookEditorNote(input: CreateBookEditorNoteInput): CreatedBookEditorNote {
  const note = createEditorNote({
    id: input.id,
    initialBookTopic: {
      book: input.book,
      mode: 0,
      title: input.topicTitle,
    },
    learningEnabled: input.learningEnabled,
    title: input.noteTitle,
  })
  const topic = note.getEntries().find(entry => entry.kind === 'topic' && entry.topicType === 'book')
  if (!topic)
    throw new Error(`New Book Note ${input.id} does not contain its BookTopic`)
  return { note, topicId: topic.id }
}

export function persistInitializedEditorNote(
  storage: Pick<EditorStorage, 'notes'>,
  note: EditorNote,
): Promise<StoredNote> {
  const projection = projectEditorNoteStorage(note)
  return storage.notes.createInitializedNote({
    ...projection,
    id: note.id,
    snapshot: note.exportSnapshot(),
    title: note.getTitle(),
  })
}
