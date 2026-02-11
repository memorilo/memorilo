import { Effect } from 'effect'
import { getService } from '../runtime'

export type ToastType = 'Info' | 'Success' | 'Warning' | 'Error'

export interface ToastEventPayload {
  toast_type: ToastType
  ns: string
  i18n_key: string
  values: Partial<Record<string, string>>
}

export interface ToastEventHandlers {
  listen: (cb: (event: { payload: ToastEventPayload }) => void) => Promise<() => void>
}

export class ToastEventService extends Effect.Tag('ToastEventService')<ToastEventService, ToastEventHandlers>() {}

export const toastEvent: ToastEventHandlers = new Proxy({} as ToastEventHandlers, {
  get(_target, prop) {
    const service = getService<ToastEventHandlers>(ToastEventService)
    const value = service[prop as keyof ToastEventHandlers]
    return typeof value === 'function' ? value.bind(service) : value
  },
})
