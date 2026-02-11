import { Effect } from 'effect'

export interface OpenerHandlers {
  readonly openPath: (path: string, openWith?: string) => Effect.Effect<void, unknown>
  readonly openUrl: (url: string | URL, openWith?: 'inAppBrowser' | string) => Effect.Effect<void, unknown>
  readonly revealItemInDir: (path: string | string[]) => Effect.Effect<void, unknown>
}

export class OpenerService extends Effect.Tag('OpenerService')<OpenerService, OpenerHandlers>() {}
