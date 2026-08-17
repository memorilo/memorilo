import { getRandomValues, randomUUID } from 'expo-crypto'

function createAbortError(): Error {
  if (typeof DOMException === 'function')
    return new DOMException('This operation was aborted', 'AbortError')

  const error = new Error('This operation was aborted')
  error.name = 'AbortError'
  return error
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? createAbortError()
}

if (typeof globalThis.crypto !== 'object') {
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: {},
    writable: true,
  })
}

if (typeof globalThis.crypto.getRandomValues !== 'function') {
  Object.defineProperty(globalThis.crypto, 'getRandomValues', {
    configurable: true,
    value: getRandomValues,
    writable: true,
  })
}

if (typeof globalThis.crypto.randomUUID !== 'function') {
  Object.defineProperty(globalThis.crypto, 'randomUUID', {
    configurable: true,
    value: randomUUID,
    writable: true,
  })
}

if (typeof AbortSignal.prototype.throwIfAborted !== 'function') {
  Object.defineProperty(AbortSignal.prototype, 'throwIfAborted', {
    configurable: true,
    value(this: AbortSignal): void {
      if (this.aborted)
        throw abortReason(this)
    },
    writable: true,
  })
}

if (typeof AbortSignal.any !== 'function') {
  Object.defineProperty(AbortSignal, 'any', {
    configurable: true,
    value(signals: AbortSignal[]): AbortSignal {
      const controller = new AbortController()
      const subscriptions = new Map<AbortSignal, () => void>()

      const abortFrom = (signal: AbortSignal): void => {
        if (controller.signal.aborted)
          return
        controller.abort(abortReason(signal))
        for (const [subscribedSignal, listener] of subscriptions)
          subscribedSignal.removeEventListener('abort', listener)
        subscriptions.clear()
      }

      for (const signal of signals) {
        if (signal.aborted) {
          abortFrom(signal)
          break
        }
        const listener = () => abortFrom(signal)
        subscriptions.set(signal, listener)
        signal.addEventListener('abort', listener, { once: true })
      }

      return controller.signal
    },
    writable: true,
  })
}
