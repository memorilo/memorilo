import * as tauriOpener from '@tauri-apps/plugin-opener'
import { Effect } from 'effect'

export function openURL(url: string | URL) {
  return tauriOpener.openUrl(url)
}

export function openURLEffect(url: string | URL) {
  return Effect.promise(() => openURL(url))
}
