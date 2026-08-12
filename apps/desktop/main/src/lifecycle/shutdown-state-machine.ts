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
  saveWindow: (window: Window) => Promise<boolean>
}

/** Owns the two close paths so a renderer save cannot be admitted twice. */
export function createShutdownStateMachine<Window extends ShutdownWindow>({
  closeRuntime,
  getWindows,
  onError,
  quit,
  saveWindow,
}: ShutdownStateMachineOptions<Window>) {
  const readyWindows = new WeakSet<Window>()
  const savedWindows = new WeakSet<Window>()
  const windowAttempts = new WeakMap<Window, Promise<boolean>>()
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
    for (const window of windows) {
      savedWindows.delete(window)
      setWindowEnabled(window, true, 'Failed to restore a window after shutdown was cancelled')
    }
  }

  const disableWindows = (windows: readonly Window[]): void => {
    for (const window of windows)
      setWindowEnabled(window, false, 'Failed to disable a window during shutdown')
  }

  const saveWindowOnce = (window: Window): Promise<boolean> => {
    if (savedWindows.has(window))
      return Promise.resolve(true)
    const existing = windowAttempts.get(window)
    if (existing)
      return existing
    const attempt = Promise.resolve().then(() => saveWindow(window))
    windowAttempts.set(window, attempt)
    void attempt.then(
      (saved) => {
        if (saved)
          savedWindows.add(window)
        else
          savedWindows.delete(window)
        if (windowAttempts.get(window) === attempt)
          windowAttempts.delete(window)
      },
      () => {
        savedWindows.delete(window)
        if (windowAttempts.get(window) === attempt)
          windowAttempts.delete(window)
      },
    )
    return attempt
  }

  const startWindowClose = (window: Window): void => {
    void saveWindowOnce(window).then((saved) => {
      if (!saved) {
        setWindowEnabled(window, true, 'Failed to restore a window after shutdown was cancelled')
        return
      }
      // Application shutdown owns renderer lifetime once it has joined this
      // save. Keep the disabled renderer alive until runtime cleanup and quit
      // finish; a failed application attempt restores it below.
      if (applicationAttempt !== undefined || quitting)
        return
      readyWindows.add(window)
      window.close()
    }, (error) => {
      onError('Failed to coordinate renderer save before closing the window', error)
      setWindowEnabled(window, true, 'Failed to restore a window after shutdown failed')
    })
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
      const saved = await Promise.all(windows.map(window => saveWindowOnce(window)))
      if (saved.some(result => !result)) {
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
