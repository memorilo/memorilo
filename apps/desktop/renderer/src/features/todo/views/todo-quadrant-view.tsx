import type { DesktopTodoCalendarEvent, DesktopTodoCalendarSubscription, DesktopTodoTask, UpdateDesktopTodoTaskInput } from '@memorilo/desktop-api'
import type { TFunction } from 'i18next'
import type { TodoQuadrant } from '../todo-model'
import * as stylex from '@stylexjs/stylex'
import dayjs from 'dayjs'
import { useMemo } from 'react'
import { classifyTodoQuadrant, todoTaskKey } from '../todo-model'
import { TodoPlanningTask } from './todo-planning-task'
import { todoPlanningViewStyles as planningStyles } from './todo-planning-view.stylex'
import { todoQuadrantViewStyles as styles } from './todo-quadrant-view.stylex'

const quadrantDefinitions: readonly { id: TodoQuadrant, labelKey: string, signal: 'critical' | 'important' | 'quiet' | 'urgent' }[] = [
  { id: 'importantUrgent', labelKey: 'quadrantImportantUrgent', signal: 'critical' },
  { id: 'importantNotUrgent', labelKey: 'quadrantImportantNotUrgent', signal: 'important' },
  { id: 'notImportantUrgent', labelKey: 'quadrantNotImportantUrgent', signal: 'urgent' },
  { id: 'notImportantNotUrgent', labelKey: 'quadrantNotImportantNotUrgent', signal: 'quiet' },
]

export function TodoQuadrantView({
  calendarEvents,
  calendarSubscriptions,
  now,
  onOpenTask,
  onUpdateTask,
  t,
  tasks,
}: {
  calendarEvents: readonly DesktopTodoCalendarEvent[]
  calendarSubscriptions: readonly DesktopTodoCalendarSubscription[]
  now: number
  onOpenTask: (task: DesktopTodoTask) => Promise<void> | void
  onUpdateTask: (input: UpdateDesktopTodoTaskInput) => Promise<void>
  t: TFunction
  tasks: readonly DesktopTodoTask[]
}) {
  const today = dayjs(now).format('YYYY-MM-DD')
  const grouped = useMemo(() => {
    const result: Record<TodoQuadrant, DesktopTodoTask[]> = {
      importantNotUrgent: [],
      importantUrgent: [],
      notImportantNotUrgent: [],
      notImportantUrgent: [],
    }
    for (const task of tasks)
      result[classifyTodoQuadrant(task, today)].push(task)
    return result
  }, [tasks, today])

  return (
    <div {...stylex.props(planningStyles.root)}>
      <div {...stylex.props(planningStyles.toolbar)}>
        <div {...stylex.props(planningStyles.toolbarTitle)}>
          <span {...stylex.props(planningStyles.title)}>{t('quadrantView')}</span>
          <span {...stylex.props(planningStyles.subtitle)}>{t('quadrantSubtitle')}</span>
        </div>
        <span {...stylex.props(styles.rule)}>{t('quadrantRule')}</span>
      </div>
      <div {...stylex.props(styles.grid)}>
        {quadrantDefinitions.map((definition) => {
          const quadrantTasks = grouped[definition.id]
          return (
            <section key={definition.id} {...stylex.props(styles.panel)} aria-label={t(definition.labelKey)}>
              <header {...stylex.props(styles.header)}>
                <span {...stylex.props(styles.title)}>
                  <span
                    {...stylex.props(
                      styles.signal,
                      definition.signal === 'important' && styles.signalImportant,
                      definition.signal === 'urgent' && styles.signalUrgent,
                      definition.signal === 'quiet' && styles.signalQuiet,
                    )}
                    aria-hidden="true"
                  />
                  {t(definition.labelKey)}
                </span>
                <span {...stylex.props(styles.count)}>{quadrantTasks.length}</span>
              </header>
              <div {...stylex.props(styles.body)}>
                {quadrantTasks.length === 0
                  ? <div {...stylex.props(styles.empty)}>{t('noTasksInQuadrant')}</div>
                  : quadrantTasks.map(task => (
                      <TodoPlanningTask
                        calendarEvents={calendarEvents}
                        calendarSubscriptions={calendarSubscriptions}
                        key={todoTaskKey(task)}
                        now={now}
                        onOpenTask={onOpenTask}
                        onUpdateTask={onUpdateTask}
                        t={t}
                        task={task}
                      />
                    ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
