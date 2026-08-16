import type { DesktopTodoTaskStatus } from '@memorilo/desktop-api'
import type { TodoFilter, TodoView } from '../features/todo/todo-model'
import { createFileRoute } from '@tanstack/react-router'
import { lazy, Suspense, useEffect } from 'react'
import { useDesktopConfiguration } from '../shared/configuration'

const TodoPage = lazy(async () => {
  const module = await import('../features/todo/todo-page')
  return { default: module.TodoPage }
})

interface TodoSearch {
  status?: DesktopTodoTaskStatus
  view?: TodoView
}

function validateTodoSearch(search: Record<string, unknown>): TodoSearch {
  if (search.status !== undefined
    && search.status !== 'todo'
    && search.status !== 'doing'
    && search.status !== 'done') {
    throw new TypeError('Todo status must be todo, doing, or done')
  }
  if (search.view !== undefined
    && search.view !== 'list'
    && search.view !== 'board'
    && search.view !== 'timeline'
    && search.view !== 'calendar'
    && search.view !== 'quadrant') {
    throw new TypeError('Todo view must be list, board, timeline, calendar, or quadrant')
  }
  return {
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
  const { status, view } = Route.useSearch()
  const navigate = Route.useNavigate()
  const filter: TodoFilter = view === undefined || view === 'list' ? status ?? 'all' : 'all'

  useEffect(() => {
    if (!configuration.todo.enabled)
      void navigate({ replace: true, to: '/journals' })
  }, [configuration.todo.enabled, navigate])
  if (!configuration.todo.enabled)
    return null

  return (
    <Suspense fallback={null}>
      <TodoPage
        filter={filter}
        view={view ?? 'list'}
        onFilterChange={nextFilter => navigate({
          replace: true,
          search: current => ({
            ...(current.view === undefined ? {} : { view: current.view }),
            ...(nextFilter === 'all' ? {} : { status: nextFilter }),
          }),
        })}
        onViewChange={nextView => navigate({
          replace: true,
          search: nextView === 'list' ? {} : { view: nextView },
        })}
        onOpenTask={task => navigate({
          params: { noteId: task.noteId, topicId: task.topicId },
          to: '/note/$noteId/$topicId',
        })}
      />
    </Suspense>
  )
}
