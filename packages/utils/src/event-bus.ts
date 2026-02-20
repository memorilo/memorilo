import mitt from 'mitt'

export const EventBus = mitt<{
  I18N_UPDATE: string
  SIDEBAR_CLOSE: void
}>()
