import * as opener from '@tauri-apps/plugin-opener'
import { Effect } from 'effect'

export const openerHandlers = {
  openPath: (path: string, openWith?: string) =>
    Effect.tryPromise(() => opener.openPath(path, openWith)),
  openUrl: (url: string | URL, openWith?: 'inAppBrowser' | string) =>
    Effect.tryPromise(() => opener.openUrl(url, openWith)),
  revealItemInDir: (path: string | string[]) =>
    Effect.tryPromise(() => opener.revealItemInDir(path)),
}
