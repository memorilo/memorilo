export interface ShutdownWindow {
  readonly webContents: {
    isDestroyed: () => boolean
  }
  close: () => void
  isDestroyed: () => boolean
  setEnabled: (enabled: boolean) => void
}

export interface ShutdownEvent {
  preventDefault: () => void
}

export interface ShutdownStateMachineOptions<Window extends ShutdownWindow> {
  closeRuntime: () => Promise<void>
  getWindows: () => readonly Window[]
  onError: (message: string, error: unknown) => void
  quit: () => void
  saveAllWindows: () => Promise<boolean>
  saveWindow: (window: Window) => Promise<boolean>
}

/** Owns the two close paths so a renderer save cannot be admitted twice. */
export function createShutdownStateMachine<Window extends ShutdownWindow>({
  closeRuntime,
  getWindows,
  onError,
  quit,
  saveAllWindows,
  saveWindow,
}: ShutdownStateMachineOptions<Window>) {
  const readyWindows = new WeakSet<Window>()
  const windowAttempts = new WeakMap<Window, Promise<void>>()
  let applicationAttempt: Promise<boolean> | undefined
  let applicationComplete = false
  let runtimeClosed = false
  let quitting = false

  const setWindowEnabled = (
    window: Window,
    enabled: boolean,
    failureMessage: string,
  ): void => {
    if (window.isDestroyed())
      return
    try {
      window.setEnabled(enabled)
    }
    catch (error) {
      onError(failureMessage, error)
    }
  }

  const restoreWindows = (windows: readonly Window[]): void => {
    for (const window of windows)
      setWindowEnabled(window, true, 'Failed to restore a window after shutdown was cancelled')
  }

  const disableWindows = (windows: readonly Window[]): void => {
    for (const window of windows)
      setWindowEnabled(window, false, 'Failed to disable a window during shutdown')
  }

  const startWindowClose = (window: Window): void => {
    const attempt = saveWindow(window).then((saved) => {
      if (!saved || quitting) {
        setWindowEnabled(window, true, 'Failed to restore a window after shutdown was cancelled')
        return
      }
      readyWindows.add(window)
      window.close()
    }, (error) => {
      onError('Failed to coordinate renderer save before closing the window', error)
      setWindowEnabled(window, true, 'Failed to restore a window after shutdown failed')
    })
    windowAttempts.set(window, attempt)
    void attempt.then(
      () => {
        if (windowAttempts.get(window) === attempt)
          windowAttempts.delete(window)
      },
      () => {
        if (windowAttempts.get(window) === attempt)
          windowAttempts.delete(window)
      },
    )
  }

  const handleWindowClose = (window: Window, event: ShutdownEvent): void => {
    if (
      quitting
      || readyWindows.has(window)
      || window.webContents.isDestroyed()
    ) {
      return
    }
    event.preventDefault()
    if (applicationComplete || applicationAttempt !== undefined || windowAttempts.has(window))
      return
    setWindowEnabled(window, false, 'Failed to disable a window during shutdown')
    startWindowClose(window)
  }

  const requestApplicationQuit = (): Promise<boolean> => {
    if (applicationComplete || quitting)
      return Promise.resolve(true)
    if (applicationAttempt)
      return applicationAttempt

    const windows = getWindows()
    disableWindows(windows)
    const attempt = (async () => {
      if (!await saveAllWindows()) {
        restoreWindows(windows)
        return false
      }
      if (!runtimeClosed) {
        await closeRuntime()
        runtimeClosed = true
      }
      quitting = true
      try {
        quit()
      }
      catch (error) {
        quitting = false
        throw error
      }
      applicationComplete = true
      return true
    })()
    const observed = attempt.then((closed) => {
      if (!closed)
        applicationAttempt = undefined
      return closed
    }, (error) => {
      applicationAttempt = undefined
      onError('Failed to shut down Memorilo cleanly', error)
      restoreWindows(windows)
      return false
    })
    applicationAttempt = observed
    return observed
  }

  const handleBeforeQuit = (event: ShutdownEvent): void => {
    if (quitting || applicationComplete)
      return
    event.preventDefault()
    void requestApplicationQuit()
  }

  return {
    handleBeforeQuit,
    handleWindowClose,
    isQuitting: () => quitting,
    requestApplicationQuit,
  }
}
