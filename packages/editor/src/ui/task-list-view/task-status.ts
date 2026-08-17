import type { Attrs } from 'prosekit/pm/model'
import type { TaskHistory, TaskStatus, TaskTimingAttrs } from '../../schema/task-schema'
import { readTaskStatus, transitionTaskAttrs } from '../../schema/task-schema'

export type { TaskHistory, TaskStatus } from '../../schema/task-schema'

export const TASK_STATUSES: readonly TaskStatus[] = ['todo', 'doing', 'done']

/** Resolve and validate the task status from raw list attributes. */
export function effectiveStatus(attrs: Attrs): TaskStatus {
  return readTaskStatus(attrs.status)
}

/** The next status when the control is clicked (cycles without leaving the task). */
export function nextClickStatus(status: TaskStatus): TaskStatus {
  switch (status) {
    case 'todo':
      return 'doing'
    case 'doing':
      return 'done'
    case 'done':
      return 'todo'
  }
}

export type { TaskTimingAttrs } from '../../schema/task-schema'

/**
 * Compute the list attributes for moving a task to `next`, settling the
 * wall-clock timer along the way.
 *
 * Timing is accumulative: entering `doing` records a start timestamp, and
 * leaving `doing` folds the elapsed wall-clock span back into `elapsedMs`.
 */
export function transitionAttrs(attrs: Attrs, next: TaskStatus, now = Date.now()): TaskTimingAttrs {
  return transitionTaskAttrs(attrs, next, now)
}

/** Settle a task timer before temporarily turning the task into a plain block. */
export function pauseTask(attrs: Attrs, now = Date.now()): TaskHistory {
  return {
    status: effectiveStatus(attrs),
    elapsedMs: totalElapsed(attrs, now),
  }
}

/** Restore a task from the timing metadata kept on its temporary plain block. */
export function resumeTask(history: TaskHistory, now = Date.now()): TaskTimingAttrs {
  return {
    status: history.status,
    elapsedMs: history.elapsedMs,
    startedAt: history.status === 'doing' ? now : null,
    checked: history.status === 'done',
  }
}

/** Total elapsed milliseconds, including the live span while `doing`. */
export function totalElapsed(attrs: Attrs, now = Date.now()): number {
  const elapsedMs = typeof attrs.elapsedMs === 'number' ? attrs.elapsedMs : 0
  const startedAt = typeof attrs.startedAt === 'number' ? attrs.startedAt : null
  if (effectiveStatus(attrs) === 'doing' && startedAt != null)
    return elapsedMs + Math.max(0, now - startedAt)
  return elapsedMs
}

/** Format a duration into an adaptive, compact label (e.g. `45s`, `12m`, `1h23m`). */
export function formatDuration(ms: number, showSeconds = false): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  if (totalSeconds < 60)
    return `${totalSeconds}s`

  const totalMinutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (totalMinutes < 60) {
    return showSeconds ? `${totalMinutes}m${String(seconds).padStart(2, '0')}s` : `${totalMinutes}m`
  }

  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (showSeconds)
    return `${hours}h${String(minutes).padStart(2, '0')}m${String(seconds).padStart(2, '0')}s`
  return minutes === 0 ? `${hours}h` : `${hours}h${minutes}m`
}
