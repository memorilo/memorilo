import type { DesktopTodoTaskStatus } from '@memorilo/desktop-api'
import type { TodoListScopeId, TodoListSelection, TodoView } from '../features/todo/todo-model'
import { createFileRoute } from '@tanstack/react-router'
import { lazy, Suspense, useEffect } from 'react'
import { isTodoListScopeId, isTodoStatus, isTodoView } from '../features/todo/todo-model'
import { useDesktopConfiguration } from '../shared/configuration'

const TodoPage = lazy(async () => {
  const module = await import('../features/todo/todo-page')
  return { default: module.TodoPage }
})

interface TodoSearch {
  note?: string
  scope?: TodoListScopeId
  status?: DesktopTodoTaskStatus
  view?: TodoView
}

function validateTodoSearch(search: Record<string, unknown>): TodoSearch {
  if (search.status !== undefined && !isTodoStatus(search.status)) {
    throw new TypeError('Todo status must be todo, doing, or done')
  }
  if (search.view !== undefined && !isTodoView(search.view)) {
    throw new TypeError('Todo view must be list, board, agenda, timeline, calendar, or quadrant')
  }
  if (search.scope !== undefined && !isTodoListScopeId(search.scope))
    throw new TypeError('Todo scope is invalid')
  if (search.note !== undefined && (typeof search.note !== 'string' || search.note.length === 0))
    throw new TypeError('Todo note must be a non-empty string')
  return {
    ...(search.note === undefined ? {} : { note: search.note }),
    ...(search.scope === undefined ? {} : { scope: search.scope }),
    ...(search.status === undefined ? {} : { status: search.status }),
    ...(search.view === undefined ? {} : { view: search.view }),
  }
}

export const Route = createFileRoute('/todo')({
  component: TodoRoute,
  validateSearch: validateTodoSearch,
})

function TodoRoute() {
  const configuration = useDesktopConfiguration()
  const { note, scope, status, view } = Route.useSearch()
  const navigate = Route.useNavigate()
  const selection: TodoListSelection = note !== undefined
    ? { kind: 'note', noteId: note }
    : { id: scope ?? status ?? 'all', kind: 'scope' }

  useEffect(() => {
    if (!configuration.todo.enabled)
      void navigate({ replace: true, to: '/journals' })
  }, [configuration.todo.enabled, navigate])
  if (!configuration.todo.enabled)
    return null

  return (
    <Suspense fallback={null}>
      <TodoPage
        selection={selection}
        view={view ?? 'list'}
        onSelectionChange={nextSelection => navigate({
          replace: true,
          search: current => ({
            ...(current.view === undefined ? {} : { view: current.view }),
            ...(nextSelection.kind === 'note'
              ? { note: nextSelection.noteId }
              : nextSelection.id === 'all' ? {} : { scope: nextSelection.id }),
          }),
        })}
        onViewChange={nextView => navigate({
          replace: true,
          search: {
            ...(selection.kind === 'note'
              ? { note: selection.noteId }
              : selection.id === 'all' ? {} : { scope: selection.id }),
            ...(nextView === 'list' ? {} : { view: nextView }),
          },
        })}
      />
    </Suspense>
  )
}
