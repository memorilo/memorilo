import type { DesktopRegularNote } from '@memorilo/desktop-api'
import type { DesktopApi } from '@memorilo/desktop-preload'
import { createEditorNote } from '@memorilo/editor'
import { deferred } from '@memorilo/effect-lifecycle/testing'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { desktopRequests } from '../../../shared/desktop-requests'
import { NotePersistenceContext } from '../persistence/note-persistence-hooks'
import { NotePersistenceManager } from '../persistence/note-persistence-manager'
import { desktopEditorAdapters, useEditorNoteSession } from './note-editor-session'

function storedNote(id: string): { stored: DesktopRegularNote, topicId: string } {
  const note = createEditorNote({ id, title: id })
  const topic = note.getEntries().find(entry => entry.kind === 'topic')
  if (!topic)
    throw new Error(`Test Note ${id} does not contain a Topic`)
  return {
    stored: {
      createdAt: 1,
      favorite: false,
      id,
      kind: 'regular',
      snapshot: note.exportSnapshot(),
      title: id,
      updatedAt: 1,
    },
    topicId: topic.id,
  }
}

afterEach(() => {
  Reflect.deleteProperty(window, 'desktop')
  vi.restoreAllMocks()
})

it('flushes the active Note before completing a recurring task through the desktop API', async () => {
  const calls: string[] = []
  const flush = vi.fn(async () => {
    calls.push('flush')
  })
  const updateTodoTask = vi.spyOn(desktopRequests, 'updateTodoTask').mockImplementation(async () => {
    calls.push('updateTodoTask')
  })
  const adapters = desktopEditorAdapters('url', {
    flush,
    noteId: 'recurring-note',
    topicId: 'recurring-topic',
  })
  if (!adapters.taskActions)
    throw new Error('Desktop editor adapters did not expose recurring task actions')

  await adapters.taskActions.completeRecurring({ blockId: 'recurring-task' })

  expect(calls).toEqual(['flush', 'updateTodoTask'])
  expect(updateTodoTask).toHaveBeenCalledWith({
    blockId: 'recurring-task',
    noteId: 'recurring-note',
    status: 'done',
    topicId: 'recurring-topic',
  })
})

it('keeps a superseded Note load from replacing or failing the current session', async () => {
  const first = storedNote('first-note')
  const second = storedNote('second-note')
  const firstLoad = deferred<DesktopRegularNote>()
  const loadFirst = vi.fn(() => firstLoad.promise)
  const loadSecond = vi.fn(async () => second.stored)
  const manager = new NotePersistenceManager({
    adapter: { saveNoteUpdates: async () => ({ updatedAt: 1 }) },
  })
  Object.defineProperty(window, 'desktop', {
    configurable: true,
    value: {
      subscribeNoteUpdates: () => () => undefined,
    } as unknown as DesktopApi,
  })

  function Harness({
    loadNote,
    noteId,
    topicId,
  }: {
    loadNote: () => Promise<DesktopRegularNote>
    noteId: string
    topicId: string
  }) {
    const session = useEditorNoteSession({ loadNote, noteId, topicId })
    return <output>{session.loadError ?? session.opened?.stored.id ?? 'loading'}</output>
  }

  const rendered = render(
    <NotePersistenceContext value={manager}>
      <Harness loadNote={loadFirst} noteId={first.stored.id} topicId={first.topicId} />
    </NotePersistenceContext>,
  )
  await waitFor(() => expect(loadFirst).toHaveBeenCalledOnce())

  rendered.rerender(
    <NotePersistenceContext value={manager}>
      <Harness loadNote={loadSecond} noteId={second.stored.id} topicId={second.topicId} />
    </NotePersistenceContext>,
  )
  await waitFor(() => expect(rendered.getByText(second.stored.id)).toBeInTheDocument())

  firstLoad.reject(new Error('obsolete load failed'))
  await waitFor(() => expect(rendered.getByText(second.stored.id)).toBeInTheDocument())
  expect(rendered.queryByText('obsolete load failed')).not.toBeInTheDocument()

  rendered.unmount()
  await manager.close()
})

it('publishes local entry-tree changes to the mounted Note inspector state', async () => {
  const fixture = storedNote('entry-note')
  const manager = new NotePersistenceManager({
    adapter: { saveNoteUpdates: async () => ({ updatedAt: 1 }) },
    debounceMs: 60_000,
  })
  Object.defineProperty(window, 'desktop', {
    configurable: true,
    value: {
      subscribeNoteUpdates: () => () => undefined,
    } as unknown as DesktopApi,
  })
  const loadNote = async () => fixture.stored

  function Harness() {
    const session = useEditorNoteSession({
      loadNote,
      noteId: fixture.stored.id,
      topicId: fixture.topicId,
    })
    if (!session.opened)
      return <output>loading</output>
    return (
      <button
        type="button"
        onClick={() => session.opened?.note.createFolder({ name: 'Research' })}
      >
        {session.opened.entries.map(entry => entry.kind === 'folder' ? entry.name : entry.title).join(',')}
      </button>
    )
  }

  const rendered = render(
    <NotePersistenceContext value={manager}>
      <Harness />
    </NotePersistenceContext>,
  )
  const editor = await rendered.findByRole('button')

  fireEvent.click(editor)

  await waitFor(() => expect(editor).toHaveTextContent('Research'))
  rendered.unmount()
  await manager.close()
})
