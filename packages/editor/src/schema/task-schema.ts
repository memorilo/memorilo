import type { Extension } from 'prosekit/core'
import { defineNodeAttr, union } from 'prosekit/core'

export type TaskStatus = 'todo' | 'doing' | 'done'

export interface TaskHistory {
  status: TaskStatus
  elapsedMs: number
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

export function defineTaskAttrs(): Extension {
  return union(
    defineNodeAttr<'list', 'status', TaskStatus | null>({
      type: 'list',
      attr: 'status',
      default: null,
      splittable: false,
      toDOM: value => (value ? ['data-task-status', value] : null),
      parseDOM: (element) => {
        const value = element.getAttribute('data-task-status')
        return value === 'todo' || value === 'doing' || value === 'done' ? value : null
      },
    }),
    defineNodeAttr({
      type: 'list',
      attr: 'elapsedMs',
      default: 0,
      splittable: false,
      toDOM: value => (value ? ['data-task-elapsed', String(value)] : null),
      parseDOM: (element) => {
        const raw = element.getAttribute('data-task-elapsed')
        const parsed = raw == null ? 0 : Number.parseInt(raw, 10)
        return Number.isFinite(parsed) ? parsed : 0
      },
    }),
    defineNodeAttr<'list', 'startedAt', number | null>({
      type: 'list',
      attr: 'startedAt',
      default: null,
      splittable: false,
      toDOM: value => (value != null ? ['data-task-started-at', String(value)] : null),
      parseDOM: (element) => {
        const raw = element.getAttribute('data-task-started-at')
        if (raw == null)
          return null
        const parsed = Number.parseInt(raw, 10)
        return Number.isFinite(parsed) ? parsed : null
      },
    }),
    defineNodeAttr<'paragraph', 'taskHistory', TaskHistory | null>({
      type: 'paragraph',
      attr: 'taskHistory',
      default: null,
      splittable: false,
      toDOM: value => (value ? ['data-task-history', JSON.stringify(value)] : null),
      parseDOM: (element) => {
        const raw = element.getAttribute('data-task-history')
        if (raw == null)
          return null
        try {
          return parseTaskHistory(JSON.parse(raw))
        }
        catch {
          return null
        }
      },
    }),
  )
}
