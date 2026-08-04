interface SingleInstanceApplication {
  quit: () => void
  requestSingleInstanceLock: () => boolean
}

interface PrimaryWindow {
  focus: () => void
  isMinimized: () => boolean
  restore: () => void
  show: () => void
}

export function acquireSingleInstance(app: SingleInstanceApplication): boolean {
  if (app.requestSingleInstanceLock())
    return true
  app.quit()
  return false
}

export function showPrimaryWindow(window: PrimaryWindow): void {
  if (window.isMinimized())
    window.restore()
  window.show()
  window.focus()
}
