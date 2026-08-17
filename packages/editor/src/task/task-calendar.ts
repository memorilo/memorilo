export interface TaskCalendarEvent {
  startDate: string
  subscriptionId: string
}

export interface TaskCalendarSubscription {
  enabled: boolean
  id: string
  title: string
}

export interface TaskCalendarSnapshot {
  events: readonly TaskCalendarEvent[]
  subscriptions: readonly TaskCalendarSubscription[]
}

export interface TaskCalendarAdapter {
  load: () => Promise<TaskCalendarSnapshot>
}
