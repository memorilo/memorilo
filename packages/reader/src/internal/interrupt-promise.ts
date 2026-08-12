/**
 * Observes cancellation without abandoning ownership of the underlying work.
 * Callers may use the same signal to cancel a cooperative transport, but this
 * Promise does not settle until that transport really settles. Resource close
 * can therefore drain the operation before releasing its adapter.
 */
export async function interruptPromise<Result>(
  operation: Promise<Result>,
  signal: AbortSignal | undefined,
): Promise<Result> {
  if (!signal)
    return operation
  try {
    const result = await operation
    signal.throwIfAborted()
    return result
  }
  catch (error) {
    if (signal.aborted)
      throw signal.reason
    throw error
  }
}
