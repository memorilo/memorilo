import type { DesktopTodoCalendarEvent, DesktopTodoTask, DesktopTodoTaskStatus, UpdateDesktopTodoTaskInput } from '@memorilo/desktop-api'
import type { TFunction } from 'i18next'
import type { TodoFilter, TodoView } from './todo-model'
import * as stylex from '@stylexjs/stylex'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  Circle,
  CircleCheck,
  CircleDotDashed,
  Columns3,
  List,
  ListTodo,
  LoaderCircle,
  TriangleAlert,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDesktopConfiguration } from '../../shared/configuration'
import { desktopRequests } from '../../shared/desktop-requests'
import { usePageTitlebar } from '../../shared/page-titlebar'
import { todoQueryKeys } from './query-keys'
import { formatTaskDuration, groupTodoTasks, taskElapsedMs, todoCalendarQueryOptions, todoStatuses, todoTaskQueryOptions } from './todo-model'
import { todoPageStyles } from './todo-page.stylex'
import { PlanningViewIcon, TodoCalendarView, TodoQuadrantView, TodoTimelineView } from './todo-planning-views'
import { TodoTaskActions } from './todo-task-actions'

const rowHeight = 58
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

function estimateRowSize() {
  return rowHeight
}

function taskKey(task: DesktopTodoTask): string {
  return `${task.noteId}\0${task.topicId}\0${task.blockId}`
}

function statusLabel(status: DesktopTodoTaskStatus, t: TFunction): string {
  switch (status) {
    case 'todo':
      return t('statusTodo')
    case 'doing':
      return t('statusDoing')
    case 'done':
      return t('statusDone')
  }
}

function viewLabel(view: TodoView, t: TFunction): string {
  const option = viewOptions.find(item => item.id === view)
  if (!option)
    throw new Error(`Unknown Todo view: ${view}`)
  return t(option.labelKey)
}

function ViewIcon({ view }: { view: TodoView }) {
  if (view === 'list')
    return <List aria-hidden="true" size={14} strokeWidth={1.8} />
  if (view === 'board')
    return <Columns3 aria-hidden="true" size={14} strokeWidth={1.8} />
  return <PlanningViewIcon view={view} />
}

function TaskStatusIcon({ status }: { status: DesktopTodoTaskStatus }) {
  switch (status) {
    case 'todo':
      return <Circle {...stylex.props(todoPageStyles.statusIcon)} aria-hidden="true" strokeWidth={1.7} />
    case 'doing':
      return <CircleDotDashed {...stylex.props(todoPageStyles.statusIcon, todoPageStyles.statusDoing)} aria-hidden="true" strokeWidth={1.8} />
    case 'done':
      return <CircleCheck {...stylex.props(todoPageStyles.statusIcon, todoPageStyles.statusDone)} aria-hidden="true" strokeWidth={1.8} />
  }
}

function BoardView({
  calendarEvents,
  isFetchingMore,
  now,
  onOpenTask,
  onUpdateTask,
  t,
  tasks,
}: {
  calendarEvents: readonly DesktopTodoCalendarEvent[]
  isFetchingMore: boolean
  now: number
  onOpenTask: (task: DesktopTodoTask) => Promise<void> | void
  onUpdateTask: (input: UpdateDesktopTodoTaskInput) => Promise<void>
  t: TFunction
  tasks: readonly DesktopTodoTask[]
}) {
  const grouped = groupTodoTasks(tasks)
  return (
    <div {...stylex.props(todoPageStyles.boardViewport)}>
      <div {...stylex.props(todoPageStyles.boardGrid)}>
        {todoStatuses.map((status) => {
          const columnTasks = grouped[status]
          return (
            <section key={status} {...stylex.props(todoPageStyles.boardColumn)} aria-label={statusLabel(status, t)}>
              <header {...stylex.props(todoPageStyles.boardColumnHeader)}>
                <span {...stylex.props(todoPageStyles.boardColumnTitle)}>
                  <TaskStatusIcon status={status} />
                  {statusLabel(status, t)}
                </span>
                <span {...stylex.props(todoPageStyles.boardColumnCount)}>{columnTasks.length}</span>
              </header>
              <div {...stylex.props(todoPageStyles.boardColumnBody)}>
                {columnTasks.length === 0
                  ? <p {...stylex.props(todoPageStyles.boardColumnEmpty)}>{t('noTasksInColumn')}</p>
                  : columnTasks.map((task) => {
                      const elapsed = formatTaskDuration(taskElapsedMs(task, now))
                      return (
                        <div {...stylex.props(todoPageStyles.boardCardShell)} key={taskKey(task)}>
                          <button
                            {...stylex.props(todoPageStyles.boardCard)}
                            aria-label={t('openTask', { note: task.noteTitle, task: task.text })}
                            title={t('openTask', { note: task.noteTitle, task: task.text })}
                            type="button"
                            onClick={() => void onOpenTask(task)}
                          >
                            <span {...stylex.props(todoPageStyles.boardCardText, task.status === 'done' && todoPageStyles.taskDone)}>{task.text}</span>
                            <span {...stylex.props(todoPageStyles.boardCardSource)}>{t('source', { note: task.noteTitle, topic: task.topicTitle })}</span>
                            <span {...stylex.props(todoPageStyles.boardCardFooter)}>
                              <span>{t('elapsed', { duration: elapsed })}</span>
                              <span aria-hidden="true">›</span>
                            </span>
                          </button>
                          <TodoTaskActions calendarEvents={calendarEvents} onUpdateTask={onUpdateTask} t={t} task={task} />
                        </div>
                      )
                    })}
                {isFetchingMore && <span {...stylex.props(todoPageStyles.boardColumnLoading)}>{t('loadingMore')}</span>}
              </div>
            </section>
          )
        })}
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
  const scrollElementRef = useRef<HTMLDivElement>(null)
  const tasksQuery = useInfiniteQuery(todoTaskQueryOptions(filter))
  const calendarQuery = useQuery(todoCalendarQueryOptions())
  const tasks = useMemo(() => tasksQuery.data
    ? tasksQuery.data.pages.flatMap(page => [...page.items])
    : [], [tasksQuery.data])
  const hasRunningTasks = tasks.some(task => task.status === 'doing' && task.startedAt !== null)
  const [now, setNow] = useState(() => Date.now())
  const updateTodoTask = useCallback(async (input: UpdateDesktopTodoTaskInput) => {
    await desktopRequests.updateTodoTask(input)
    await queryClient.invalidateQueries({ queryKey: todoQueryKeys.all })
    await calendarQuery.refetch()
  }, [calendarQuery, queryClient])

  useEffect(() => {
    if (!hasRunningTasks)
      return
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [hasRunningTasks])

  useEffect(() => {
    void queryClient.resetQueries({ queryKey: todoQueryKeys.all })
    return window.desktop.subscribeNoteUpdates(() => {
      void queryClient.resetQueries({ queryKey: todoQueryKeys.all })
    })
  }, [queryClient])

  useEffect(() => {
    const scrollElement = scrollElementRef.current
    if (scrollElement)
      scrollElement.scrollTop = 0
  }, [filter, view])

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

  const {
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = tasksQuery
  const virtualCount = view === 'list' ? tasks.length + (hasNextPage ? 1 : 0) : 0
  const getVirtualRowKey = useCallback((index: number) => {
    const task = tasks[index]
    if (task)
      return taskKey(task)
    if (index === tasks.length && hasNextPage)
      return 'load-next-todo-page'
    throw new RangeError(`Virtual Todo row ${index} is outside the list`)
  }, [hasNextPage, tasks])
  const rowVirtualizer = useVirtualizer({
    count: virtualCount,
    estimateSize: estimateRowSize,
    getItemKey: getVirtualRowKey,
    getScrollElement: () => scrollElementRef.current,
    overscan: 10,
  })
  const virtualRows = rowVirtualizer.getVirtualItems()
  const lastVirtualRow = virtualRows.at(-1)

  useEffect(() => {
    if (view !== 'list'
      || !lastVirtualRow
      || lastVirtualRow.index !== tasks.length
      || !hasNextPage
      || isFetchingNextPage
      || isFetchNextPageError) {
      return
    }
    void fetchNextPage()
  }, [
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    lastVirtualRow,
    tasks.length,
    view,
  ])

  useEffect(() => {
    if (view === 'list' || !hasNextPage || isFetchingNextPage || isFetchNextPageError)
      return
    void fetchNextPage()
  }, [fetchNextPage, hasNextPage, isFetchNextPageError, isFetchingNextPage, view])

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

        <div {...stylex.props(todoPageStyles.listRegion)}>
          <div ref={scrollElementRef} {...stylex.props(todoPageStyles.listViewport)}>
            {tasksQuery.isPending
              ? (
                  <div {...stylex.props(todoPageStyles.status)}>
                    <div {...stylex.props(todoPageStyles.statusContent)}>
                      <LoaderCircle {...stylex.props(todoPageStyles.statusGlyph, todoPageStyles.loadingIcon)} aria-hidden="true" strokeWidth={1.7} />
                      <span role="status">{t('loading')}</span>
                    </div>
                  </div>
                )
              : tasksQuery.isError && tasks.length === 0
                ? (
                    <div {...stylex.props(todoPageStyles.status)}>
                      <div {...stylex.props(todoPageStyles.statusContent)}>
                        <TriangleAlert {...stylex.props(todoPageStyles.statusGlyph, todoPageStyles.errorIcon)} aria-hidden="true" strokeWidth={1.7} />
                        <span>{t('couldNotLoad')}</span>
                        <button {...stylex.props(todoPageStyles.retryButton)} type="button" onClick={() => void tasksQuery.refetch()}>
                          {t('tryAgain')}
                        </button>
                      </div>
                    </div>
                  )
                : tasks.length === 0
                  ? (
                      <div {...stylex.props(todoPageStyles.status)}>
                        <div {...stylex.props(todoPageStyles.statusContent)}>
                          <ListTodo {...stylex.props(todoPageStyles.statusGlyph)} aria-hidden="true" strokeWidth={1.6} />
                          <span>{t('noTasks')}</span>
                        </div>
                      </div>
                    )
                  : view === 'board'
                    ? (
                        <BoardView
                          calendarEvents={calendarQuery.data?.events ?? []}
                          isFetchingMore={isFetchingNextPage}
                          now={now}
                          onOpenTask={onOpenTask}
                          onUpdateTask={updateTodoTask}
                          t={t}
                          tasks={tasks}
                        />
                      )
                    : view === 'timeline'
                      ? (
                          <TodoTimelineView
                            calendarEvents={calendarQuery.data?.events ?? []}
                            locale={i18n.language}
                            now={now}
                            onOpenTask={onOpenTask}
                            onUpdateTask={updateTodoTask}
                            t={t}
                            tasks={tasks}
                          />
                        )
                      : view === 'calendar'
                        ? (
                            <TodoCalendarView
                              calendarEvents={calendarQuery.data?.events ?? []}
                              calendarSubscriptions={calendarQuery.data?.subscriptions ?? []}
                              locale={i18n.language}
                              now={now}
                              onOpenTask={onOpenTask}
                              onUpdateTask={updateTodoTask}
                              t={t}
                              tasks={tasks}
                              weekStart={configuration.weekStart}
                            />
                          )
                        : view === 'quadrant'
                          ? (
                              <TodoQuadrantView
                                calendarEvents={calendarQuery.data?.events ?? []}
                                now={now}
                                onOpenTask={onOpenTask}
                                onUpdateTask={updateTodoTask}
                                t={t}
                                tasks={tasks}
                              />
                            )
                          : (
                              <ul
                                {...stylex.props(todoPageStyles.list)}
                                aria-busy={isFetchingNextPage}
                                style={{ height: rowVirtualizer.getTotalSize() }}
                              >
                                {virtualRows.map((virtualRow) => {
                                  const task = tasks[virtualRow.index]
                                  if (!task) {
                                    if (virtualRow.index !== tasks.length || !hasNextPage)
                                      throw new RangeError(`Virtual Todo row ${virtualRow.index} is outside the list`)
                                    return (
                                      <li
                                        key={virtualRow.key}
                                        {...stylex.props(todoPageStyles.row)}
                                        style={{ transform: `translateY(${virtualRow.start}px)` }}
                                      >
                                        <div {...stylex.props(todoPageStyles.loadingMore)}>
                                          {isFetchNextPageError
                                            ? (
                                                <button {...stylex.props(todoPageStyles.retryButton)} type="button" onClick={() => void fetchNextPage()}>
                                                  {t('tryAgain')}
                                                </button>
                                              )
                                            : (
                                                <>
                                                  <LoaderCircle {...stylex.props(todoPageStyles.loadingMoreIcon, todoPageStyles.loadingIcon)} aria-hidden="true" strokeWidth={1.8} />
                                                  <span>{t('loadingMore')}</span>
                                                </>
                                              )}
                                        </div>
                                      </li>
                                    )
                                  }
                                  const elapsed = formatTaskDuration(taskElapsedMs(task, now))
                                  return (
                                    <li
                                      key={taskKey(task)}
                                      {...stylex.props(todoPageStyles.row)}
                                      style={{ transform: `translateY(${virtualRow.start}px)` }}
                                    >
                                      <div {...stylex.props(todoPageStyles.rowShell)}>
                                        <button
                                          {...stylex.props(todoPageStyles.rowButton)}
                                          aria-label={t('openTask', { note: task.noteTitle, task: task.text })}
                                          title={t('openTask', { note: task.noteTitle, task: task.text })}
                                          type="button"
                                          onClick={() => void onOpenTask(task)}
                                        >
                                          <span title={statusLabel(task.status, t)}>
                                            <TaskStatusIcon status={task.status} />
                                          </span>
                                          <span {...stylex.props(todoPageStyles.taskContent)}>
                                            <span {...stylex.props(todoPageStyles.taskText, task.status === 'done' && todoPageStyles.taskDone)}>
                                              {task.text}
                                            </span>
                                            <span {...stylex.props(todoPageStyles.source)}>
                                              {t('source', { note: task.noteTitle, topic: task.topicTitle })}
                                            </span>
                                          </span>
                                          <span {...stylex.props(todoPageStyles.elapsed)} title={t('elapsed', { duration: elapsed })}>
                                            {elapsed}
                                          </span>
                                        </button>
                                        <TodoTaskActions
                                          calendarEvents={calendarQuery.data?.events ?? []}
                                          onUpdateTask={updateTodoTask}
                                          t={t}
                                          task={task}
                                        />
                                      </div>
                                    </li>
                                  )
                                })}
                              </ul>
                            )}
          </div>
        </div>
      </section>
    </main>
  )
}
