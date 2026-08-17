import type { DesktopTodoCalendarEvent, DesktopTodoCalendarSubscription, DesktopTodoTask, DesktopTodoTaskStatus, UpdateDesktopTodoTaskInput } from '@memorilo/desktop-api'
import type { TFunction } from 'i18next'
import * as stylex from '@stylexjs/stylex'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Circle, CircleCheck, CircleDotDashed, LoaderCircle } from 'lucide-react'
import { useCallback, useEffect, useRef } from 'react'
import { formatTaskDuration, taskElapsedMs, todoTaskKey } from '../todo-model'
import { TodoTaskActions } from '../todo-task-actions'
import { todoListViewStyles as styles } from './todo-list-view.stylex'

const rowHeight = 58

function estimateRowSize() {
  return rowHeight
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

function TaskStatusIcon({ status }: { status: DesktopTodoTaskStatus }) {
  switch (status) {
    case 'todo':
      return <Circle {...stylex.props(styles.statusIcon)} aria-hidden="true" strokeWidth={1.7} />
    case 'doing':
      return <CircleDotDashed {...stylex.props(styles.statusIcon, styles.statusDoing)} aria-hidden="true" strokeWidth={1.8} />
    case 'done':
      return <CircleCheck {...stylex.props(styles.statusIcon, styles.statusDone)} aria-hidden="true" strokeWidth={1.8} />
  }
}

export function TodoListView({
  calendarEvents,
  calendarSubscriptions,
  hasNextPage,
  isFetchNextPageError,
  isFetchingNextPage,
  now,
  onFetchNextPage,
  onOpenTask,
  onUpdateTask,
  resetKey,
  t,
  tasks,
}: {
  calendarEvents: readonly DesktopTodoCalendarEvent[]
  calendarSubscriptions: readonly DesktopTodoCalendarSubscription[]
  hasNextPage: boolean
  isFetchNextPageError: boolean
  isFetchingNextPage: boolean
  now: number
  onFetchNextPage: () => Promise<unknown>
  onOpenTask: (task: DesktopTodoTask) => Promise<void> | void
  onUpdateTask: (input: UpdateDesktopTodoTaskInput) => Promise<void>
  resetKey: string
  t: TFunction
  tasks: readonly DesktopTodoTask[]
}) {
  const scrollElementRef = useRef<HTMLDivElement>(null)
  const virtualCount = tasks.length + (hasNextPage ? 1 : 0)
  const getVirtualRowKey = useCallback((index: number) => {
    const task = tasks[index]
    if (task)
      return todoTaskKey(task)
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
    const scrollElement = scrollElementRef.current
    if (scrollElement)
      scrollElement.scrollTop = 0
  }, [resetKey])

  useEffect(() => {
    if (!lastVirtualRow
      || lastVirtualRow.index !== tasks.length
      || !hasNextPage
      || isFetchingNextPage
      || isFetchNextPageError) {
      return
    }
    void onFetchNextPage()
  }, [
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    lastVirtualRow,
    onFetchNextPage,
    tasks.length,
  ])

  return (
    <div ref={scrollElementRef} {...stylex.props(styles.viewport)}>
      <ul
        {...stylex.props(styles.list)}
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
                {...stylex.props(styles.row)}
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                <div {...stylex.props(styles.loadingMore)}>
                  {isFetchNextPageError
                    ? (
                        <button {...stylex.props(styles.retryButton)} type="button" onClick={() => void onFetchNextPage()}>
                          {t('tryAgain')}
                        </button>
                      )
                    : (
                        <>
                          <LoaderCircle {...stylex.props(styles.loadingMoreIcon, styles.loadingIcon)} aria-hidden="true" strokeWidth={1.8} />
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
              key={todoTaskKey(task)}
              {...stylex.props(styles.row)}
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              <div {...stylex.props(styles.rowShell)}>
                <button
                  {...stylex.props(styles.rowButton)}
                  aria-label={t('openTask', { note: task.noteTitle, task: task.text })}
                  title={t('openTask', { note: task.noteTitle, task: task.text })}
                  type="button"
                  onClick={() => void onOpenTask(task)}
                >
                  <span title={statusLabel(task.status, t)}>
                    <TaskStatusIcon status={task.status} />
                  </span>
                  <span {...stylex.props(styles.taskContent)}>
                    <span {...stylex.props(styles.taskText, task.status === 'done' && styles.taskDone)}>
                      {task.text}
                    </span>
                    <span {...stylex.props(styles.source)}>
                      {t('source', { note: task.noteTitle, topic: task.topicTitle })}
                    </span>
                  </span>
                  <span {...stylex.props(styles.elapsed)} title={t('elapsed', { duration: elapsed })}>
                    {elapsed}
                  </span>
                </button>
                <TodoTaskActions
                  calendarEvents={calendarEvents}
                  calendarSubscriptions={calendarSubscriptions}
                  onUpdateTask={onUpdateTask}
                  t={t}
                  task={task}
                />
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
