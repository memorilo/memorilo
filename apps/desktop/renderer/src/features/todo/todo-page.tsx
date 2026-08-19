import type { DesktopTodoTask, UpdateDesktopTodoTaskInput } from '@memorilo/desktop-api'
import type { TFunction } from 'i18next'
import type { TodoFilter, TodoView } from './todo-model'
import * as stylex from '@stylexjs/stylex'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import {
  CalendarClock,
  CalendarDays,
  Columns3,
  Grid2X2,
  List,
  ListTodo,
  LoaderCircle,
  TriangleAlert,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDesktopConfiguration } from '../../shared/configuration'
import { desktopRequests } from '../../shared/desktop-requests'
import { usePageTitlebar } from '../../shared/page-titlebar'
import { subscribeTodoCalendarSnapshot } from '../../shared/todo-calendar-cache'
import { todoQueryKeys } from './query-keys'
import { sortTodoTasks, todoCalendarQueryOptions, todoTaskQueryOptions } from './todo-model'
import { todoPageStyles } from './todo-page.stylex'
import { TodoBoardView } from './views/todo-board-view'
import { TodoCalendarView } from './views/todo-calendar-view'
import { TodoListView } from './views/todo-list-view'
import { TodoQuadrantView } from './views/todo-quadrant-view'
import { TodoTimelineView } from './views/todo-timeline-view'

const filters: readonly { id: TodoFilter, labelKey: string }[] = [
  { id: 'all', labelKey: 'filterAll' },
  { id: 'todo', labelKey: 'statusTodo' },
  { id: 'doing', labelKey: 'statusDoing' },
  { id: 'done', labelKey: 'statusDone' },
]

const viewOptions: readonly { descriptionKey: string, id: TodoView, labelKey: string }[] = [
  { descriptionKey: 'switchToList', id: 'list', labelKey: 'listView' },
  { descriptionKey: 'switchToBoard', id: 'board', labelKey: 'boardView' },
  { descriptionKey: 'switchToTimeline', id: 'timeline', labelKey: 'timelineView' },
  { descriptionKey: 'switchToCalendar', id: 'calendar', labelKey: 'calendarView' },
  { descriptionKey: 'switchToQuadrant', id: 'quadrant', labelKey: 'quadrantView' },
]

function viewLabel(view: TodoView, t: TFunction): string {
  const option = viewOptions.find(item => item.id === view)
  if (!option)
    throw new Error(`Unknown Todo view: ${view}`)
  return t(option.labelKey)
}

function ViewIcon({ view }: { view: TodoView }) {
  switch (view) {
    case 'list':
      return <List aria-hidden="true" size={14} strokeWidth={1.8} />
    case 'board':
      return <Columns3 aria-hidden="true" size={14} strokeWidth={1.8} />
    case 'timeline':
      return <CalendarClock aria-hidden="true" size={14} strokeWidth={1.8} />
    case 'calendar':
      return <CalendarDays aria-hidden="true" size={14} strokeWidth={1.8} />
    case 'quadrant':
      return <Grid2X2 aria-hidden="true" size={14} strokeWidth={1.8} />
  }
}

function TodoStatus({
  kind,
  onRetry,
  t,
}: {
  kind: 'empty' | 'error' | 'loading'
  onRetry: () => Promise<unknown>
  t: TFunction
}) {
  return (
    <div {...stylex.props(todoPageStyles.status)}>
      <div {...stylex.props(todoPageStyles.statusContent)}>
        {kind === 'loading'
          ? <LoaderCircle {...stylex.props(todoPageStyles.statusGlyph, todoPageStyles.loadingIcon)} aria-hidden="true" strokeWidth={1.7} />
          : kind === 'error'
            ? <TriangleAlert {...stylex.props(todoPageStyles.statusGlyph, todoPageStyles.errorIcon)} aria-hidden="true" strokeWidth={1.7} />
            : <ListTodo {...stylex.props(todoPageStyles.statusGlyph)} aria-hidden="true" strokeWidth={1.6} />}
        <span role={kind === 'loading' ? 'status' : undefined}>
          {kind === 'loading' ? t('loading') : kind === 'error' ? t('couldNotLoad') : t('noTasks')}
        </span>
        {kind === 'error' && (
          <button {...stylex.props(todoPageStyles.retryButton)} type="button" onClick={() => void onRetry()}>
            {t('tryAgain')}
          </button>
        )}
      </div>
    </div>
  )
}

export function TodoPage({
  filter,
  onFilterChange,
  onOpenTask,
  onViewChange,
  view,
}: {
  filter: TodoFilter
  onFilterChange: (filter: TodoFilter) => Promise<void> | void
  onOpenTask: (task: DesktopTodoTask) => Promise<void> | void
  onViewChange: (view: TodoView) => Promise<void> | void
  view: TodoView
}) {
  const { i18n, t } = useTranslation('todo')
  const configuration = useDesktopConfiguration()
  const queryClient = useQueryClient()
  const tasksQuery = useInfiniteQuery(todoTaskQueryOptions(filter))
  const calendarQuery = useQuery(todoCalendarQueryOptions())
  const { fetchNextPage } = tasksQuery
  const tasks = useMemo(() => sortTodoTasks(tasksQuery.data
    ? tasksQuery.data.pages.flatMap(page => [...page.items])
    : []), [tasksQuery.data])
  const calendarEvents = useMemo(() => calendarQuery.data?.events ?? [], [calendarQuery.data?.events])
  const calendarSubscriptions = calendarQuery.data?.subscriptions ?? []
  const hasRunningTasks = tasks.some(task => task.status === 'doing' && task.startedAt !== null)
  const [now, setNow] = useState(() => Date.now())
  const [selectedDate, setSelectedDate] = useState(() => dayjs(now).format('YYYY-MM-DD'))
  const selectedDateEvents = useMemo(() => calendarEvents.filter(event => (
    event.startDate <= selectedDate && (event.endDate ?? event.startDate) >= selectedDate
  )), [calendarEvents, selectedDate])
  const visibleCalendarEvents = view === 'list'
    ? selectedDateEvents
    : view === 'quadrant' || view === 'board'
      ? []
      : calendarEvents
  useEffect(() => subscribeTodoCalendarSnapshot((next) => {
    queryClient.setQueryData(todoQueryKeys.calendars, next)
  }), [queryClient])
  const updateTodoTask = useCallback(async (input: UpdateDesktopTodoTaskInput) => {
    await desktopRequests.updateTodoTask(input)
    await queryClient.invalidateQueries({ queryKey: todoQueryKeys.all })
    await calendarQuery.refetch()
  }, [calendarQuery, queryClient])
  const loadNextPage = useCallback(async () => {
    await fetchNextPage()
  }, [fetchNextPage])

  useEffect(() => {
    if (!hasRunningTasks)
      return
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [hasRunningTasks])

  useEffect(() => {
    void queryClient.invalidateQueries({ queryKey: todoQueryKeys.all })
    return window.desktop.subscribeNoteUpdates(() => {
      void queryClient.invalidateQueries({ queryKey: todoQueryKeys.all })
    })
  }, [queryClient])

  useEffect(() => {
    if (view === 'list'
      || !tasksQuery.hasNextPage
      || tasksQuery.isFetchingNextPage
      || tasksQuery.isFetchNextPageError) {
      return
    }
    void loadNextPage()
  }, [
    loadNextPage,
    tasksQuery.hasNextPage,
    tasksQuery.isFetchNextPageError,
    tasksQuery.isFetchingNextPage,
    view,
  ])

  const titlebar = useMemo(() => ({
    title: t('title'),
    trailingAppearance: 'plain' as const,
    trailing: (
      <div {...stylex.props(todoPageStyles.titlebarViews)} aria-label={t('viewLabel')} role="group">
        {viewOptions.map(option => (
          <button
            key={option.id}
            {...stylex.props(todoPageStyles.titlebarViewOption, view === option.id && todoPageStyles.titlebarViewOptionSelected)}
            aria-label={t(option.descriptionKey)}
            aria-pressed={view === option.id}
            title={t(option.descriptionKey)}
            type="button"
            onClick={() => void onViewChange(option.id)}
          >
            <ViewIcon view={option.id} />
          </button>
        ))}
      </div>
    ),
  }), [onViewChange, t, view])
  usePageTitlebar(titlebar)

  let viewContent
  if (view === 'calendar') {
    viewContent = (
      <TodoCalendarView
        calendarEvents={calendarEvents}
        calendarSubscriptions={calendarSubscriptions}
        locale={i18n.language}
        now={now}
        onOpenTask={onOpenTask}
        onSelectedDateChange={setSelectedDate}
        onUpdateTask={updateTodoTask}
        selectedDate={selectedDate}
        t={t}
        tasks={tasks}
        weekStart={configuration.weekStart}
      />
    )
  }
  else if (tasksQuery.isPending && visibleCalendarEvents.length === 0) {
    viewContent = <TodoStatus kind="loading" onRetry={tasksQuery.refetch} t={t} />
  }
  else if (tasksQuery.isError && tasks.length === 0 && visibleCalendarEvents.length === 0) {
    viewContent = <TodoStatus kind="error" onRetry={tasksQuery.refetch} t={t} />
  }
  else if (view === 'list' && tasks.length === 0 && selectedDateEvents.length === 0) {
    viewContent = <TodoStatus kind="empty" onRetry={tasksQuery.refetch} t={t} />
  }
  else if (view === 'list') {
    viewContent = (
      <TodoListView
        calendarEvents={calendarEvents}
        calendarSubscriptions={calendarSubscriptions}
        hasNextPage={Boolean(tasksQuery.hasNextPage)}
        isFetchNextPageError={tasksQuery.isFetchNextPageError}
        isFetchingNextPage={tasksQuery.isFetchingNextPage}
        locale={i18n.language}
        now={now}
        onFetchNextPage={loadNextPage}
        onOpenTask={onOpenTask}
        onUpdateTask={updateTodoTask}
        resetKey={filter}
        selectedDateEvents={selectedDateEvents}
        t={t}
        tasks={tasks}
      />
    )
  }
  else if (view === 'board') {
    viewContent = (
      <TodoBoardView
        calendarEvents={calendarEvents}
        calendarSubscriptions={calendarSubscriptions}
        isFetchingMore={tasksQuery.isFetchingNextPage}
        locale={i18n.language}
        now={now}
        onOpenTask={onOpenTask}
        onUpdateTask={updateTodoTask}
        t={t}
        tasks={tasks}
      />
    )
  }
  else if (view === 'timeline') {
    viewContent = (
      <TodoTimelineView
        calendarEvents={calendarEvents}
        calendarSubscriptions={calendarSubscriptions}
        hasNextPage={Boolean(tasksQuery.hasNextPage)}
        isFetchNextPageError={tasksQuery.isFetchNextPageError}
        isFetchingNextPage={tasksQuery.isFetchingNextPage}
        locale={i18n.language}
        now={now}
        onFetchNextPage={loadNextPage}
        onOpenTask={onOpenTask}
        onUpdateTask={updateTodoTask}
        t={t}
        tasks={tasks}
      />
    )
  }
  else {
    viewContent = (
      <TodoQuadrantView
        calendarEvents={calendarEvents}
        calendarSubscriptions={calendarSubscriptions}
        locale={i18n.language}
        now={now}
        onOpenTask={onOpenTask}
        onUpdateTask={updateTodoTask}
        t={t}
        tasks={tasks}
      />
    )
  }

  return (
    <main {...stylex.props(todoPageStyles.page)} aria-label={t('title')}>
      <section {...stylex.props(todoPageStyles.content)} aria-label={viewLabel(view, t)}>
        {view === 'list' && (
          <div {...stylex.props(todoPageStyles.controls)}>
            <div {...stylex.props(todoPageStyles.filterList)} aria-label={t('filterLabel')} role="group">
              {filters.map(item => (
                <button
                  key={item.id}
                  {...stylex.props(todoPageStyles.filter, filter === item.id && todoPageStyles.filterSelected)}
                  aria-pressed={filter === item.id}
                  type="button"
                  onClick={() => void onFilterChange(item.id)}
                >
                  {t(item.labelKey)}
                </button>
              ))}
            </div>
            <p {...stylex.props(todoPageStyles.count)} aria-live="polite">
              {t('taskCount', { count: tasks.length })}
            </p>
          </div>
        )}
        <div {...stylex.props(todoPageStyles.viewRegion)}>{viewContent}</div>
      </section>
    </main>
  )
}
