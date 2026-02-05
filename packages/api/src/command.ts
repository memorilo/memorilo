import * as tauriDialog from '@tauri-apps/plugin-dialog'
import { events } from './native/bindings.gen'

export * from './native/effect'

declare global {
  interface Window {
    __TAURI__?: Record<string, unknown>
  }
}

export const isTauri = typeof window !== 'undefined' && window.__TAURI__ !== undefined

function webViewAlert(message: string, title = 'Alert') {
  // eslint-disable-next-line no-alert
  alert(`${title}\n\n${message}`)
}

interface AskOptions {
  title?: string
  kind?: 'info' | 'warning' | 'error'
  okLabel?: string
  cancelLabel?: string
}

function ask(message: string, options?: AskOptions): Promise<boolean> {
  if (!isTauri) {
    webViewAlert('ask is only available in Tauri environment', 'Error')
  }
  return tauriDialog.ask(message, options)
}

export const dialog = {
  ask,
}

export const toastEvent = events.toastEvent
