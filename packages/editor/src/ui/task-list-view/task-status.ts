import type { Attrs } from 'prosekit/pm/model'

export type TaskStatus = 'todo' | 'doing' | 'done'

export const TASK_STATUSES: readonly TaskStatus[] = ['todo', 'doing', 'done']

/**
 * Resolve the effective task status from raw list attributes.
 *
 * Falls back to the legacy `checked` flag so documents authored before the
 * three-state control still render sensibly (`checked` → `done`).
 */
export function effectiveStatus(attrs: Attrs): TaskStatus {
  const status = attrs.status
  if (status === 'todo' || status === 'doing' || status === 'done')
    return status
  return attrs.checked ? 'done' : 'todo'
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

export interface TaskTimingAttrs {
  status: TaskStatus
  elapsedMs: number
  startedAt: number | null
  checked: boolean
}

export interface TaskHistory {
  status: TaskStatus
  elapsedMs: number
}

/**
 * Compute the list attributes for moving a task to `next`, settling the
 * wall-clock timer along the way.
 *
 * Timing is accumulative: entering `doing` records a start timestamp, and
 * leaving `doing` folds the elapsed wall-clock span back into `elapsedMs`.
 */
export function transitionAttrs(attrs: Attrs, next: TaskStatus, now = Date.now()): TaskTimingAttrs {
  const current = effectiveStatus(attrs)
  let elapsedMs = typeof attrs.elapsedMs === 'number' ? attrs.elapsedMs : 0
  let startedAt = typeof attrs.startedAt === 'number' ? attrs.startedAt : null

  if (current === 'doing' && startedAt != null) {
    elapsedMs += Math.max(0, now - startedAt)
    startedAt = null
  }

  if (next === 'doing')
    startedAt = now

  return { status: next, elapsedMs, startedAt, checked: next === 'done' }
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

export function parseTaskHistory(value: unknown): TaskHistory | null {
  if (typeof value !== 'object' || value === null)
    return null

  const { status, elapsedMs } = value as Record<string, unknown>
  if (status !== 'todo' && status !== 'doing' && status !== 'done')
    return null
  if (typeof elapsedMs !== 'number' || !Number.isFinite(elapsedMs) || elapsedMs < 0)
    return null

  return { status, elapsedMs }
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
