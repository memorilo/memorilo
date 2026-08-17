import type { EditorStorage, JournalDate } from '@memorilo/editor-storage'
import type { TopicBlockEdit } from '@memorilo/editor/note'
import type {
  ApplyTopicEditsInput,
  CreateBookNoteInput,
  CreateBookNoteResult,
  CreateNoteInput,
  OpenJournalInput,
  RebindBookTopicInput,
  RenameNoteInput,
  RenameTopicInput,
  SaveNoteUpdatesInput,
  SetTopicModeInput,
  UpdateTodoTaskInput,
} from './note-application-contracts'
import type { NoteAuthoritativeRuntime } from './note-authoritative-runtime'
import { randomUUID } from 'node:crypto'
import { assertJournalDate, DuplicateNoteTitleError } from '@memorilo/editor-storage'
import { createEditorNote } from '@memorilo/editor/note'
import { planTaskAction } from '@memorilo/editor/task'
import { toError } from '@memorilo/effect-lifecycle'
import { Effect } from 'effect'
import { NoteRevisionConflictError } from './note-application-contracts'
import {
  projectApplicationNote,
  projectApplicationNoteSummary,
  projectBookTopicReadingContext,
} from './note-application-projection'
import { noteRevision } from './note-authoritative-projection'

interface NodeJSON {
  attrs?: Record<string, unknown>
  content?: NodeJSON[]
  text?: string
  type: string
}

interface NoteApplicationCommandsDependencies {
  defaultNoteLearningEnabled: () => boolean
  runtime: Pick<NoteAuthoritativeRuntime, 'applyExternalUpdates' | 'commit' | 'invalidate' | 'open' | 'openJournal' | 'persistLocalMutation' | 'prunePastEmptyJournals' | 'run' | 'runEffect'>
  storage: EditorStorage
  today: () => JournalDate
}

export function createNoteApplicationCommands({ defaultNoteLearningEnabled, runtime, storage, today }: NoteApplicationCommandsDependencies) {
  const serialize = <Result>(operation: () => Promise<Result>): Promise<Result> => runtime.run(operation)
  const serializeEffect = <Result, Failure>(operation: Effect.Effect<Result, Failure>): Promise<Result> => runtime.runEffect(operation)
  const assertRevision = (current: Awaited<ReturnType<NoteAuthoritativeRuntime['open']>>, expectedRevision: string): void => {
    const revision = noteRevision(current.note.getVersion())
    if (revision !== expectedRevision)
      throw new NoteRevisionConflictError(revision)
  }

  const findTaskNode = (document: NodeJSON, blockId: string): NodeJSON => {
    const visit = (nodes: readonly NodeJSON[]): NodeJSON | undefined => {
      for (const node of nodes) {
        if (node.type === 'list' && node.attrs?.blockId === blockId)
          return node
        const found = visit(node.content ?? [])
        if (found)
          return found
      }
    }
    const found = visit(document.content ?? [])
    if (!found || found.type !== 'list')
      throw new Error(`Todo task ${blockId} was not found in Topic`)
    return found
  }

  const paragraph = (text: string): NodeJSON => ({
    content: text.length === 0 ? [] : [{ text, type: 'text' }],
    type: 'paragraph',
  })

  const updateTodoTask = (input: UpdateTodoTaskInput) => serialize(async () => {
    const current = await runtime.open(input.noteId)
    const validation = current.note.getTopicValidationInput(input.topicId)
    if (!('document' in validation))
      throw new TypeError(`Topic ${input.topicId} does not have an editable document`)
    const source = findTaskNode(validation.document, input.blockId)
    if (source.attrs?.kind !== 'task')
      throw new TypeError(`Block ${input.blockId} is not a Todo task`)
    const sourceAttrs = source.attrs ?? {}
    const sourceBlock = current.note.getTopicContent(input.topicId).blocks.find(block => block.id === input.blockId)
    if (!sourceBlock)
      throw new Error(`Todo task ${input.blockId} disappeared from Topic projection`)
    const plan = planTaskAction(sourceAttrs, sourceBlock.text, input)
    const edits: TopicBlockEdit[] = []
    if (plan.occurrence) {
      edits.push({
        attributes: plan.current.attrs,
        blockId: input.blockId,
        operation: 'update-block-attributes',
      })
      edits.push({
        attributes: plan.occurrence.attrs,
        content: [paragraph(plan.occurrence.text)],
        kind: 'task',
        operation: 'insert-block',
        parentId: sourceBlock.parentId,
      })
    }
    else {
      if (plan.current.text !== undefined)
        edits.push({ blockId: input.blockId, content: [paragraph(plan.current.text)], operation: 'update-block-content' })
      edits.push({ attributes: plan.current.attrs, blockId: input.blockId, operation: 'update-block-attributes' })
    }
    const version = current.note.getVersion()
    try {
      current.note.applyTopicBlockEdits({ edits, topicId: input.topicId })
      await current.note.validateTopic(input.topicId)
      await runtime.persistLocalMutation(current, version, { broadcast: true, topicIds: [input.topicId] })
    }
    catch (error) {
      runtime.invalidate(input.noteId)
      throw error
    }
  })

  return {
    applyTopicEdits: (input: ApplyTopicEditsInput) => serializeEffect(Effect.gen(function* () {
      const current = yield* Effect.tryPromise({ catch: toError, try: () => runtime.open(input.noteId) })
      yield* Effect.try({ catch: toError, try: () => assertRevision(current, input.expectedRevision) })
      const version = current.note.getVersion()
      return yield* Effect.gen(function* () {
        yield* Effect.try({ catch: toError, try: () => current.note.applyTopicBlockEdits({ edits: input.edits, topicId: input.topicId }) })
        yield* current.note.validateTopic(input.topicId)
        return yield* Effect.tryPromise({
          catch: toError,
          try: () => runtime.persistLocalMutation(current, version, { broadcast: true, entries: true, topicIds: [input.topicId] }),
        })
      }).pipe(Effect.catchEager((error) => {
        runtime.invalidate(input.noteId)
        return Effect.fail(error)
      }))
    })),
    createBookNote: (input: CreateBookNoteInput) => serialize(async (): Promise<CreateBookNoteResult> => {
      const id = randomUUID()
      const note = createEditorNote({
        id,
        initialBookTopic: { book: input.book, mode: 0, title: input.topicTitle },
        learningEnabled: defaultNoteLearningEnabled(),
        title: input.noteTitle,
      })
      try {
        const current = await runtime.commit(note)
        const topic = note.getEntries().find(entry => entry.kind === 'topic' && entry.topicType === 'book')
        if (!topic)
          throw new Error(`New Book Note ${id} does not contain its BookTopic`)
        return {
          context: await projectBookTopicReadingContext(storage, current, topic.id, false),
          status: 'created',
        }
      }
      catch (error) {
        if (error instanceof DuplicateNoteTitleError)
          return { status: 'duplicate-title' }
        throw error
      }
    }),
    createNote: (input?: CreateNoteInput) => serialize(async () => {
      const note = createEditorNote({
        id: randomUUID(),
        ...(input?.initialHeading === undefined ? {} : { initialTopicHeading: input.initialHeading }),
        learningEnabled: defaultNoteLearningEnabled(),
        ...(input?.title === undefined ? {} : { title: input.title }),
      })
      return projectApplicationNote(storage, await runtime.commit(note), false)
    }),
    openJournal: (input: OpenJournalInput = {}) => serialize(async () => {
      if (input.journalDate !== undefined)
        assertJournalDate(input.journalDate)
      const currentToday = today()
      const journalDate = input.journalDate ?? currentToday
      if (journalDate > currentToday)
        throw new RangeError(`Future Journal date cannot be opened: ${journalDate}`)
      const opened = await runtime.openJournal(journalDate)
      const desktop = await projectApplicationNote(storage, opened.current, opened.created ? false : undefined)
      if (desktop.kind !== 'journal')
        throw new Error(`Journal ${journalDate} was restored as a regular Note`)
      return desktop
    }),
    prunePastEmptyJournals: () => serialize(() => runtime.prunePastEmptyJournals()),
    recordNoteOpened: (input: Parameters<EditorStorage['notes']['recordNoteOpened']>[0]) => serialize(() => storage.notes.recordNoteOpened(input)),
    rebindBookTopic: (input: RebindBookTopicInput) => serialize(async () => {
      const current = await runtime.open(input.noteId)
      const version = current.note.getVersion()
      try {
        current.note.getBookTopic(input.topicId).rebind(input.book)
        await runtime.persistLocalMutation(current, version, { broadcast: true, entries: true, topicIds: [input.topicId] })
        return projectBookTopicReadingContext(storage, current, input.topicId)
      }
      catch (error) {
        runtime.invalidate(input.noteId)
        throw error
      }
    }),
    renameNote: (input: RenameNoteInput) => serialize(async () => {
      const current = await runtime.open(input.noteId)
      if (current.journalDate !== null)
        return { journalDate: current.journalDate, status: 'journal-title-immutable' } as const
      const title = input.title.trim()
      if (title === current.note.getTitle())
        return { note: await projectApplicationNoteSummary(storage, current), status: 'renamed' } as const
      try {
        const version = current.note.getVersion()
        current.note.renameNote(title)
        await runtime.persistLocalMutation(current, version, { title: true })
        return { note: await projectApplicationNoteSummary(storage, current), status: 'renamed' } as const
      }
      catch (error) {
        runtime.invalidate(input.noteId)
        if (error instanceof DuplicateNoteTitleError)
          return { status: 'duplicate-title' } as const
        throw error
      }
    }),
    renameTopic: (input: RenameTopicInput) => serialize(async () => {
      const current = await runtime.open(input.noteId)
      assertRevision(current, input.expectedRevision)
      const version = current.note.getVersion()
      try {
        current.note.renameEntry(input.topicId, input.title)
        return await runtime.persistLocalMutation(current, version, { broadcast: true, entries: true, topicIds: [input.topicId] })
      }
      catch (error) {
        runtime.invalidate(input.noteId)
        throw error
      }
    }),
    saveNoteUpdates: (input: SaveNoteUpdatesInput) => serializeEffect(runtime.applyExternalUpdates(input)),
    setNoteFavorite: (input: Parameters<EditorStorage['notes']['setNoteFavorite']>[0]) => serialize(() => storage.notes.setNoteFavorite(input)),
    setTopicMode: (input: SetTopicModeInput) => serialize(async () => {
      const current = await runtime.open(input.noteId)
      assertRevision(current, input.expectedRevision)
      const version = current.note.getVersion()
      try {
        current.note.getTopic(input.topicId).setMode(input.mode)
        return await runtime.persistLocalMutation(current, version, { broadcast: true, entries: true })
      }
      catch (error) {
        runtime.invalidate(input.noteId)
        throw error
      }
    }),
    updateTodoTask,
  }
}

export type NoteApplicationCommands = ReturnType<typeof createNoteApplicationCommands>
