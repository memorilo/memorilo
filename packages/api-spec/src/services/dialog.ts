import { Effect } from 'effect'
import { getService } from '../runtime'

export interface AskOptions {
  title?: string
  kind?: 'info' | 'warning' | 'error'
  okLabel?: string
  cancelLabel?: string
}

export interface DialogApi {
  ask: (message: string, options?: AskOptions) => Promise<boolean>
}

export class DialogService extends Effect.Tag('DialogService')<DialogService, DialogApi>() {}

export const dialog: DialogApi = {
  ask: (message, options) => getService<DialogApi>(DialogService).ask(message, options),
}
