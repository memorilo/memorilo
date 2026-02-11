import { Effect } from 'effect'
import { getService } from '../runtime'

export interface AskOptions {
  title?: string
  kind?: 'info' | 'warning' | 'error'
  okLabel?: string
  cancelLabel?: string
}

export interface DialogHandlers {
  ask: (message: string, options?: AskOptions) => Promise<boolean>
}

export class DialogService extends Effect.Tag('DialogService')<DialogService, DialogHandlers>() {}

export const dialog: DialogHandlers = {
  ask: (message, options) => getService<DialogHandlers>(DialogService).ask(message, options),
}
