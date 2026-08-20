import type { DesktopTodoCalendarEvent, DesktopTodoCalendarSubscription } from '@memorilo/desktop-api'
import dayjs from 'dayjs'
import { desktopRequests } from './desktop-requests'

export interface TodoCalendarSnapshot {
  events: readonly DesktopTodoCalendarEvent[]
  subscriptions: readonly DesktopTodoCalendarSubscription[]
}

export const todoCalendarAutoRefreshIntervalMs = 6 * 60 * 60 * 1_000

let snapshot: TodoCalendarSnapshot | null = null
let loading: Promise<TodoCalendarSnapshot> | null = null
const listeners = new Set<(snapshot: TodoCalendarSnapshot) => void>()

export function hasTodoCalendarSnapshot(): boolean {
  return snapshot !== null
}

export function loadTodoCalendarSnapshot(): Promise<TodoCalendarSnapshot> {
  if (snapshot !== null)
    return Promise.resolve(snapshot)
  if (loading !== null)
    return loading

  const year = dayjs().year()
  loading = desktopRequests.listTodoCalendarSubscriptions()
    .then(async (subscriptions) => {
      const events = await desktopRequests.listTodoCalendarEvents({
        from: `${year - 1}-01-01`,
        through: `${year + 5}-12-31`,
      })
      const nextSnapshot = { events, subscriptions }
      snapshot = nextSnapshot
      for (const listener of listeners)
        listener(nextSnapshot)
      return nextSnapshot
    })
    .finally(() => {
      loading = null
    })

  return loading
}

export function reloadTodoCalendarSnapshot(): Promise<TodoCalendarSnapshot> {
  snapshot = null
  return loadTodoCalendarSnapshot()
}

export function subscribeTodoCalendarSnapshot(
  listener: (snapshot: TodoCalendarSnapshot) => void,
): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
