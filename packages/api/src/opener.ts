import * as opener from '@tauri-apps/plugin-opener'
import { Effect } from 'effect'

export function openPath(path: string, openWith?: string): Effect.Effect<void, unknown> {
  return Effect.tryPromise(() => opener.openPath(path, openWith))
}

export function openUrl(
  url: string | URL,
  openWith?: 'inAppBrowser' | string,
): Effect.Effect<void, unknown> {
  return Effect.tryPromise(() => opener.openUrl(url, openWith))
}

export function revealItemInDir(
  path: string | string[],
): Effect.Effect<void, unknown> {
  return Effect.tryPromise(() => opener.revealItemInDir(path))
}
