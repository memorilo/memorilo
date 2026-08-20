import type { TFunction } from 'i18next'
import * as stylex from '@stylexjs/stylex'
import { formatTaskDueDate, taskDueState } from './todo-model'
import { todoTaskMetadataStyles as styles } from './todo-task-metadata.stylex'

export function TodoTaskMetadata({
  allDay = false,
  compact = false,
  dueDate,
  dueTime,
  endAt,
  elapsed,
  locale,
  now,
  startAt,
  t,
}: {
  allDay?: boolean
  compact?: boolean
  dueDate: string | null
  dueTime: string | null
  endAt: string | null
  elapsed: string
  locale: string
  now: number
  startAt: string | null
  t: TFunction
}) {
  const scheduleDate = dueDate ?? (startAt === null ? null : startAt.slice(0, 10))
  const dueState = scheduleDate === null ? null : taskDueState(scheduleDate, now)
  const formattedDueDate = scheduleDate === null ? null : formatTaskDueDate(scheduleDate, locale, now)
  const scheduleTime = !allDay && startAt !== null && endAt !== null
    ? `${startAt.slice(11)}–${endAt.slice(11)}`
    : dueTime
  const dueLabel = formattedDueDate === null
    ? null
    : t(dueState === 'overdue' ? 'overdue' : 'dueDate', { date: scheduleTime === null ? formattedDueDate : `${formattedDueDate} ${scheduleTime}` })

  return (
    <span {...stylex.props(styles.metadata, compact && styles.metadataCompact)}>
      {dueLabel !== null && (
        <span
          {...stylex.props(styles.due, compact && styles.dueCompact, dueState === 'overdue' && styles.overdue)}
          title={dueLabel}
        >
          {dueLabel}
        </span>
      )}
      <span {...stylex.props(styles.elapsed, !compact && styles.elapsedDefault)} title={t('elapsed', { duration: elapsed })}>
        {t('elapsed', { duration: elapsed })}
      </span>
    </span>
  )
}
