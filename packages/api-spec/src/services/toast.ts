import { Effect } from 'effect'
import { getService } from '../runtime'

export type ToastType = 'Info' | 'Success' | 'Warning' | 'Error'

export interface ToastEventPayload {
  toast_type: ToastType
  ns: string
  i18n_key: string
  values: Partial<Record<string, string>>
}

export interface ToastEventApi {
  listen: (cb: (event: { payload: ToastEventPayload }) => void) => Promise<() => void>
}

export class ToastEventService extends Effect.Tag('ToastEventService')<ToastEventService, ToastEventApi>() {}

export const toastEvent: ToastEventApi = new Proxy({} as ToastEventApi, {
  get(_target, prop) {
    const service = getService<ToastEventApi>(ToastEventService)
    const value = service[prop as keyof ToastEventApi]
    return typeof value === 'function' ? value.bind(service) : value
  },
})
