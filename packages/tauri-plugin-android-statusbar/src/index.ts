import { invoke } from '@tauri-apps/api/core'

export interface SetFullscreenOptions {
  statusBarColor?: string
}

export async function setFullscreen(
  fullscreen: boolean,
  options: SetFullscreenOptions = {},
): Promise<void> {
  await invoke('plugin:android-statusbar|set_fullscreen', {
    fullscreen,
    ...options,
  })
}
