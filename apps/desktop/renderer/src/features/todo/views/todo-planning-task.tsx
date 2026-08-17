import type { DesktopTodoCalendarEvent, DesktopTodoTask, DesktopTodoTaskStatus, UpdateDesktopTodoTaskInput } from '@memorilo/desktop-api'
import type { TFunction } from 'i18next'
import * as stylex from '@stylexjs/stylex'
import { Circle, CircleCheck, CircleDotDashed } from 'lucide-react'
import { formatTaskDuration, taskElapsedMs } from '../todo-model'
import { TodoTaskActions } from '../todo-task-actions'
import { todoPlanningTaskStyles as styles } from './todo-planning-task.stylex'

function TaskStatusIcon({ status }: { status: DesktopTodoTaskStatus }) {
  switch (status) {
    case 'todo':
      return <Circle {...stylex.props(styles.icon)} aria-hidden="true" strokeWidth={1.8} />
    case 'doing':
      return <CircleDotDashed {...stylex.props(styles.icon, styles.doing)} aria-hidden="true" strokeWidth={1.8} />
    case 'done':
      return <CircleCheck {...stylex.props(styles.icon, styles.doneIcon)} aria-hidden="true" strokeWidth={1.8} />
  }
}

export function TodoPlanningTask({
  calendarEvents,
  now,
  onOpenTask,
  onUpdateTask,
  t,
  task,
}: {
  calendarEvents: readonly DesktopTodoCalendarEvent[]
  now: number
  onOpenTask: (task: DesktopTodoTask) => Promise<void> | void
  onUpdateTask: (input: UpdateDesktopTodoTaskInput) => Promise<void>
  t: TFunction
  task: DesktopTodoTask
}) {
  const elapsed = formatTaskDuration(taskElapsedMs(task, now))
  return (
    <div {...stylex.props(styles.shell)}>
      <button
        {...stylex.props(styles.task)}
        aria-label={t('openTask', { note: task.noteTitle, task: task.text })}
        title={t('openTask', { note: task.noteTitle, task: task.text })}
        type="button"
        onClick={() => void onOpenTask(task)}
      >
        <TaskStatusIcon status={task.status} />
        <span {...stylex.props(styles.content)}>
          <span {...stylex.props(styles.title, task.status === 'done' && styles.done)}>{task.text}</span>
          <span {...stylex.props(styles.meta)}>{t('source', { note: task.noteTitle, topic: task.topicTitle })}</span>
        </span>
        <span {...stylex.props(styles.elapsed)} title={t('elapsed', { duration: elapsed })}>{elapsed}</span>
      </button>
      <div {...stylex.props(styles.actions)}>
        <TodoTaskActions calendarEvents={calendarEvents} onUpdateTask={onUpdateTask} t={t} task={task} />
      </div>
    </div>
  )
}
