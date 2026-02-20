import mitt from 'mitt'

export const SIDEBAR_CLOSE_EVENT = 'SIDEBAR_CLOSE' as const

export const EventBus = mitt<{
  I18N_UPDATE: string
  [SIDEBAR_CLOSE_EVENT]: void
}>()
