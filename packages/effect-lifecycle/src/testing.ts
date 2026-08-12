export interface Deferred<Value> {
  readonly promise: Promise<Value>
  readonly reject: (reason?: unknown) => void
  readonly resolve: (value: Value | PromiseLike<Value>) => void
}

/** Creates a promise whose settlement is controlled explicitly by a test. */
export function deferred<Value = void>(): Deferred<Value> {
  let reject!: (reason?: unknown) => void
  let resolve!: (value: Value | PromiseLike<Value>) => void
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    reject = rejectPromise
    resolve = resolvePromise
  })
  return { promise, reject, resolve }
}
