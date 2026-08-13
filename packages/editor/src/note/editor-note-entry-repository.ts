import type {
  CreateBookTopicInput,
  CreateFolderInput,
  CreateTopicInput,
  CreateWhiteboardTopicInput,
  DeleteNoteEntryInput,
  MoveNoteEntryInput,
  NoteEntrySnapshot,
} from './editor-note'
import type { EditorNoteDocument } from './editor-note-runtime'
import {
  ENTRY_ID_KEY,
  ENTRY_KIND_KEY,
  findNoteEntry,
  FOLDER_NAME_KEY,
  noteTree,
  readString,
  readTopicType,
  TOPIC_TITLE_KEY,
  validateBookBindingValue,
} from './editor-note-crdt'
import { projectEditorNote } from './editor-note-projection'
import {
  assertBookFileAvailable,
  readTopicValidationInput,
  validateTopicInput,
} from './editor-note-topic-documents'
import { createTopicNode } from './editor-note-topic-factory'
import {
  normalizeNonEmptyString,
  normalizeTopicTitle,
  resolveNoteEntryIndex,
} from './editor-note-validation'
import { createWhiteboardNode, whiteboardHasUserContent } from './editor-note-whiteboard'
import { hasTopicUserContent } from './topic-user-content'

interface EditorNoteEntryRepositoryDependencies {
  readonly runMutation: <Result>(operation: () => Result) => Result
  readonly runtime: EditorNoteDocument
}

export interface EditorNoteEntryRepository {
  readonly createBookTopic: (input: CreateBookTopicInput) => string
  readonly createFolder: (input: CreateFolderInput) => string
  readonly createTopic: (input: CreateTopicInput) => string
  readonly createWhiteboardTopic: (input: CreateWhiteboardTopicInput) => string
  readonly deleteEntry: (input: DeleteNoteEntryInput) => void
  readonly getEntries: () => readonly NoteEntrySnapshot[]
  readonly hasUserContent: () => boolean
  readonly moveEntry: (input: MoveNoteEntryInput) => void
  readonly renameEntry: (entryId: string, label: string) => void
}

export function createEditorNoteEntryRepository(
  dependencies: EditorNoteEntryRepositoryDependencies,
): EditorNoteEntryRepository {
  const { runMutation, runtime } = dependencies
  const { doc } = runtime
  const entryNode = (entryId: string) => findNoteEntry(doc, entryId)
  const resolveParent = (parentId: string | null | undefined) => {
    return parentId === null || parentId === undefined ? undefined : entryNode(parentId)
  }
  const assertFolderParent = (parent: ReturnType<typeof entryNode> | undefined): void => {
    if (parent?.data.get(ENTRY_KIND_KEY) === 'topic') {
      const parentId = readString(parent.data, ENTRY_ID_KEY, 'Topic id')
      throw new TypeError(`Folder cannot use Topic ${parentId} as its parent`)
    }
  }

  return {
    createBookTopic: input => runMutation(() => {
      const book = validateBookBindingValue(input.book, 'BookTopic binding')
      assertBookFileAvailable(runtime, book)
      const parent = resolveParent(input.parentId)
      const entryId = createTopicNode(doc, input, parent?.id, book)
      doc.commit({ origin: 'note:create-book-topic' })
      return entryId
    }),
    createFolder: input => runMutation(() => {
      const index = resolveNoteEntryIndex(input.index)
      const name = normalizeNonEmptyString(input.name, 'Folder name')
      const parent = resolveParent(input.parentId)
      assertFolderParent(parent)
      const node = noteTree(doc).createNode(parent?.id, index)
      const entryId = crypto.randomUUID()
      node.data.set(ENTRY_ID_KEY, entryId)
      node.data.set(ENTRY_KIND_KEY, 'folder')
      node.data.set(FOLDER_NAME_KEY, name)
      doc.commit({ origin: 'note:create-folder' })
      return entryId
    }),
    createTopic: input => runMutation(() => {
      const parent = resolveParent(input.parentId)
      const entryId = createTopicNode(doc, input, parent?.id)
      doc.commit({ origin: 'note:create-topic' })
      return entryId
    }),
    createWhiteboardTopic: input => runMutation(() => {
      const parent = resolveParent(input.parentId)
      const entryId = createWhiteboardNode(doc, input, parent?.id)
      validateTopicInput(readTopicValidationInput(runtime, entryId))
      doc.commit({ origin: 'note:create-whiteboard-topic' })
      return entryId
    }),
    deleteEntry: input => runMutation(() => {
      const node = entryNode(input.entryId)
      const parent = node.parent()
      const index = node.index()
      if (index === undefined)
        throw new Error(`NoteEntry ${input.entryId} does not have a tree position`)

      if (input.strategy === 'promote-children') {
        const children = node.children() ?? []
        children.forEach((child, offset) => child.move(parent, index + offset))
        noteTree(doc).delete(node.id)
      }
      else if (input.strategy === 'delete-subtree') {
        const remove = (current: typeof node): void => {
          current.children()?.forEach(remove)
          noteTree(doc).delete(current.id)
        }
        remove(node)
      }
      else {
        throw new TypeError(`Unknown NoteEntry deletion strategy: ${String(input.strategy)}`)
      }
      doc.commit({ origin: 'note:delete-entry' })
    }),
    getEntries: () => projectEditorNote(doc, false).entries,
    hasUserContent: () => {
      const entries = projectEditorNote(doc, false).entries
      if (entries.length !== 1)
        return true
      const [entry] = entries
      if (!entry || entry.kind !== 'topic' || entry.parentId !== null)
        return true

      const validation = readTopicValidationInput(runtime, entry.id)
      const topic = validateTopicInput(validation)
      if (entry.topicType === 'whiteboard')
        return topic.entry.title.length > 0 || whiteboardHasUserContent(validation)
      if (!('document' in validation))
        throw new Error(`Topic ${entry.id} is missing its document`)
      return topic.entry.title.length > 0 || hasTopicUserContent(validation.document)
    },
    moveEntry: input => runMutation(() => {
      const node = entryNode(input.entryId)
      const parent = resolveParent(input.parentId)
      if (node.data.get(ENTRY_KIND_KEY) === 'folder')
        assertFolderParent(parent)
      noteTree(doc).move(node.id, parent?.id, resolveNoteEntryIndex(input.index))
      doc.commit({ origin: 'note:move-entry' })
    }),
    renameEntry: (entryId, label) => runMutation(() => {
      const node = entryNode(entryId)
      const kind = node.data.get(ENTRY_KIND_KEY)
      if (kind === 'folder') {
        node.data.set(FOLDER_NAME_KEY, normalizeNonEmptyString(label, 'Folder name'))
      }
      else if (kind === 'topic') {
        node.data.set(TOPIC_TITLE_KEY, readTopicType(node.data, `Topic ${entryId} type`) === 'book'
          ? normalizeNonEmptyString(label, 'BookTopic title')
          : normalizeTopicTitle(label))
      }
      else {
        throw new Error(`NoteEntry ${entryId} has unknown kind: ${String(kind)}`)
      }
      doc.commit({ origin: 'note:rename-entry' })
    }),
  }
}
