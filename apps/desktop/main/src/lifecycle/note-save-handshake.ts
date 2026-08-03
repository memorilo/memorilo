import type { NoteSaveResult } from '@memorilo/desktop-preload/note-save-handshake'
import type { WebContents } from 'electron'
import { randomUUID } from 'node:crypto'
import { noteSaveRequestChannel, noteSaveResultChannel } from '@memorilo/desktop-preload/note-save-handshake'

export type RendererNoteSaveOutcome = {
  status: 'saved'
} | {
  message: string
  status: 'failed'
} | {
  pendingRendererIds: readonly number[]
  status: 'timed-out'
}

export interface NoteSaveIpcMain {
  off: (channel: string, listener: (event: Electron.IpcMainEvent, result: NoteSaveResult) => void) => unknown
  on: (channel: string, listener: (event: Electron.IpcMainEvent, result: NoteSaveResult) => void) => unknown
}

export interface FlushRendererNotesOptions {
  ipcMain: NoteSaveIpcMain
  targets: readonly Pick<WebContents, 'id' | 'isDestroyed' | 'send'>[]
  timeoutMs?: number
}

export async function flushRendererNotes({
  ipcMain,
  targets,
  timeoutMs = 5_000,
}: FlushRendererNotesOptions): Promise<RendererNoteSaveOutcome> {
  const liveTargets = targets.filter(target => !target.isDestroyed())
  if (liveTargets.length === 0)
    return { status: 'saved' }

  const requestId = randomUUID()
  const pending = new Set(liveTargets.map(target => target.id))
  return new Promise<RendererNoteSaveOutcome>((resolve) => {
    let settled = false
    let timeout: ReturnType<typeof setTimeout>
    const handleResult = (event: Electron.IpcMainEvent, result: NoteSaveResult): void => {
      if (result.requestId !== requestId || !pending.has(event.sender.id))
        return
      if (result.status === 'failed') {
        settled = true
        clearTimeout(timeout)
        ipcMain.off(noteSaveResultChannel, handleResult)
        resolve({ message: result.message, status: 'failed' })
        return
      }
      pending.delete(event.sender.id)
      if (pending.size === 0) {
        settled = true
        clearTimeout(timeout)
        ipcMain.off(noteSaveResultChannel, handleResult)
        resolve({ status: 'saved' })
      }
    }
    timeout = setTimeout(() => {
      if (settled)
        return
      settled = true
      ipcMain.off(noteSaveResultChannel, handleResult)
      resolve({ pendingRendererIds: [...pending], status: 'timed-out' })
    }, timeoutMs)
    ipcMain.on(noteSaveResultChannel, handleResult)
    liveTargets.forEach(target => target.send(noteSaveRequestChannel, { requestId }))
  })
}
