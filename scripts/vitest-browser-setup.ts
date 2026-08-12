// Vitest's Chromium environment exposes a non-callable setImmediate
// placeholder while Effect beta.23 selects its scheduler by property name.
const globals = globalThis as Record<string, unknown>

if (typeof globals.setImmediate !== 'function') {
  Object.defineProperty(globalThis, 'setImmediate', {
    configurable: true,
    value: (callback: () => void) => {
      const handle = { cancelled: false }
      queueMicrotask(() => {
        if (!handle.cancelled)
          callback()
      })
      return handle
    },
    writable: true,
  })
}

if (typeof globals.clearImmediate !== 'function') {
  Object.defineProperty(globalThis, 'clearImmediate', {
    configurable: true,
    value: (handle: { cancelled: boolean }) => {
      handle.cancelled = true
    },
    writable: true,
  })
}
