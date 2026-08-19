import type { DesktopTodoCalendarEvent, DesktopTodoCalendarSubscription } from '@memorilo/desktop-api'
import dayjs from 'dayjs'
import { desktopRequests } from './desktop-requests'

export interface TodoCalendarSnapshot {
  events: readonly DesktopTodoCalendarEvent[]
  subscriptions: readonly DesktopTodoCalendarSubscription[]
}

let snapshot: TodoCalendarSnapshot | null = null
let loading: Promise<TodoCalendarSnapshot> | null = null

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
      return nextSnapshot
    })
    .finally(() => {
      loading = null
    })

  return loading
}
