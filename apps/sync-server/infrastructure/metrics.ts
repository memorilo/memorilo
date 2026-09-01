/**
 * Metrics emitted by storage and peer infrastructure. The application layer
 * implements the recorder, while infrastructure only depends on this contract.
 */
export interface SyncPeerMetrics {
  readonly activeObjectTransfers: number
  readonly activeSyncSessions: number
}

export interface SyncPeerMetricsRecorder {
  readonly authoritativeCommit: (durationMs: number) => void
  readonly databaseFailure: () => void
  readonly objectStoreFailure: () => void
  readonly quotaRejected: () => void
  readonly relayDelivered: () => void
  readonly relayDropped: () => void
  readonly relayFailed: () => void
  readonly resetJobs: (pending: number, oldestAgeMs: number) => void
}

const connectionFailureCodes = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'EPIPE',
  'ETIMEDOUT',
])

function errorCode(error: Error): string | undefined {
  const code = Reflect.get(error, 'code')
  return typeof code === 'string' ? code : undefined
}

export function isDatabaseInfrastructureFailure(error: unknown): boolean {
  if (error instanceof AggregateError)
    return error.errors.some(isDatabaseInfrastructureFailure)
  if (!(error instanceof Error))
    return false

  const cause = Reflect.get(error, 'cause')
  if (cause !== undefined && isDatabaseInfrastructureFailure(cause))
    return true

  const code = errorCode(error)
  if (code?.startsWith('SQLITE_CONSTRAINT') === true || code?.startsWith('23') === true)
    return false
  if (error.name === 'SqliteError' || code?.startsWith('SQLITE_') === true)
    return true
  if (error.name === 'PostgresError')
    return true
  return code !== undefined && connectionFailureCodes.has(code)
}

/** Counts provider faults while leaving rejected domain operations out of infrastructure health metrics. */
function withFailureMetrics<Service extends object>(
  service: Service,
  onFailure: (error: unknown) => void,
): Service {
  return new Proxy(service, {
    get(target, property, receiver) {
      const member = Reflect.get(target, property, receiver)
      if (typeof member !== 'function')
        return member
      return async (...args: readonly unknown[]) => {
        try {
          return await Reflect.apply(member, target, args)
        }
        catch (error) {
          onFailure(error)
          throw error
        }
      }
    },
  })
}

export function withDatabaseFailureMetrics<Service extends object>(service: Service, recorder?: SyncPeerMetricsRecorder): Service {
  if (recorder === undefined)
    return service
  return withFailureMetrics(service, (error) => {
    if (isDatabaseInfrastructureFailure(error))
      recorder.databaseFailure()
  })
}

export function withObjectStoreFailureMetrics<Service extends object>(service: Service, recorder?: SyncPeerMetricsRecorder): Service {
  if (recorder === undefined)
    return service
  return withFailureMetrics(service, () => recorder.objectStoreFailure())
}
