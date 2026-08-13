import { createOperationSupervisor } from '@memorilo/effect-lifecycle'
import { app, powerMonitor } from 'electron'

export interface JournalRollover {
  close: () => Promise<void>
}

export function installJournalRollover(
  notes: { openJournal: () => Promise<unknown> },
): JournalRollover {
  const checks = createOperationSupervisor('Journal rollover')
  let listeningForFocus = true
  let listeningForResume = true
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | null = null

  const recheck = (): void => {
    if (stopped)
      return
    void checks.runSingleFlight(() => notes.openJournal()).then(
      () => undefined,
      (error) => {
        if (!stopped)
          console.error('Failed to ensure today\'s Journal', error)
      },
    )
  }

  const schedule = (): void => {
    if (stopped)
      return
    if (timer)
      clearTimeout(timer)
    const now = new Date()
    const nextMidnight = new Date(now)
    nextMidnight.setDate(nextMidnight.getDate() + 1)
    nextMidnight.setHours(0, 0, 0, 0)
    timer = setTimeout(() => {
      recheck()
      schedule()
    }, Math.max(nextMidnight.getTime() - now.getTime() + 250, 1_000))
    timer.unref()
  }

  const handleTemporalChange = (): void => {
    recheck()
    schedule()
  }

  app.on('browser-window-focus', handleTemporalChange)
  powerMonitor.on('resume', handleTemporalChange)
  schedule()

  const close = (): Promise<void> => {
    stopped = true
    if (timer)
      clearTimeout(timer)
    timer = null
    if (listeningForFocus) {
      app.removeListener('browser-window-focus', handleTemporalChange)
      listeningForFocus = false
    }
    if (listeningForResume) {
      powerMonitor.removeListener('resume', handleTemporalChange)
      listeningForResume = false
    }
    return checks.close()
  }

  return { close }
}
