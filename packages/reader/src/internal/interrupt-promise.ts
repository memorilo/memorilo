/**
 * Stops awaiting a non-cancellable Promise when the reader session is aborted.
 * The original Promise remains observed so a later rejection is never unhandled.
 */
export function interruptPromise<Result>(
  operation: Promise<Result>,
  signal: AbortSignal | undefined,
): Promise<Result> {
  if (!signal)
    return operation
  if (signal.aborted) {
    // The Promise already exists, so abandoning it without handlers would
    // turn a later transport failure into an unhandled rejection.
    void operation.then(undefined, () => undefined)
    return Promise.reject(signal.reason)
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort)
      reject(signal.reason)
    }
    signal.addEventListener('abort', onAbort, { once: true })
    void operation.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      },
    )
  })
}
