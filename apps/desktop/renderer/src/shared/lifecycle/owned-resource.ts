import type {
  LatestOperationSupervisorOptions,
  OperationSupervisor,
  OperationSupervisorOptions,
} from '@memorilo/effect-lifecycle'
import {
  createLatestOperationSupervisor,
  createOperationSupervisor,
} from '@memorilo/effect-lifecycle'
import { useLayoutEffect, useRef, useState } from 'react'

export interface CloseableResource {
  close: () => Promise<void>
}

function reportCloseError(name: string, handler: ((error: unknown) => void) | undefined, error: unknown): void {
  try {
    if (handler)
      handler(error)
    else
      console.error(`Failed to close ${name}`, error)
  }
  catch {
    // Resource ownership must not depend on diagnostics succeeding.
  }
}

function closeWithoutUnhandledRejection(
  name: string,
  resource: CloseableResource,
  onCloseError: ((error: unknown) => void) | undefined,
): void {
  let closing: Promise<void>
  try {
    closing = resource.close()
  }
  catch (error) {
    reportCloseError(name, onCloseError, error)
    return
  }
  void closing.then(
    () => undefined,
    error => reportCloseError(name, onCloseError, error),
  )
}

/**
 * Acquires a closeable resource only after React commits the render. A changed
 * key or final unmount owns exactly one close attempt; StrictMode's discarded
 * render initializers therefore cannot leak an unobserved resource.
 */
export function useOwnedResource<Key, Resource extends CloseableResource>(
  name: string,
  key: Key | null,
  acquire: (key: Key) => Resource,
  onCloseError?: (error: unknown) => void,
): Resource | null {
  const acquireRef = useRef(acquire)
  const closeErrorRef = useRef(onCloseError)
  const [owned, setOwned] = useState<{ key: Key, resource: Resource } | null>(null)
  acquireRef.current = acquire
  closeErrorRef.current = onCloseError

  useLayoutEffect(() => {
    if (key === null) {
      setOwned(null)
      return
    }
    const resource = acquireRef.current(key)
    setOwned({ key, resource })
    return () => closeWithoutUnhandledRejection(name, resource, closeErrorRef.current)
  }, [key, name])

  return owned !== null && Object.is(owned.key, key) ? owned.resource : null
}

type OperationMethods = Pick<OperationSupervisor, 'run' | 'runSingleFlight'>

/** Owns one Effect operation supervisor for the committed React lifetime. */
export function useOperationSupervisor(
  name: string,
  options: OperationSupervisorOptions = {},
): OperationMethods {
  const configuration = useRef({ name, options }).current
  const supervisor = useOwnedResource(
    `${name} supervisor`,
    configuration,
    current => createOperationSupervisor(current.name, current.options),
  )
  const current = useRef(supervisor)
  current.current = supervisor
  const [methods] = useState<OperationMethods>(() => ({
    run: operation => current.current?.run(operation)
      ?? Promise.reject(new Error(`${configuration.name} is not mounted`)),
    runSingleFlight: operation => current.current?.runSingleFlight(operation)
      ?? Promise.reject(new Error(`${configuration.name} is not mounted`)),
  }))
  return methods
}

type LatestOperations<Channel extends PropertyKey>
  = Pick<
    ReturnType<typeof createLatestOperationSupervisor<Channel>>,
    'invalidate' | 'run'
  >

/** Owns one latest-operation supervisor for the committed React lifetime. */
export function useLatestOperations<Channel extends PropertyKey>(
  name: string,
  options: LatestOperationSupervisorOptions = {},
): LatestOperations<Channel> {
  const configuration = useRef({ name, options }).current
  const supervisor = useOwnedResource(
    `${name} supervisor`,
    configuration,
    current => createLatestOperationSupervisor<Channel>(current.name, current.options),
  )
  const current = useRef(supervisor)
  current.current = supervisor
  const [operations] = useState<LatestOperations<Channel>>(() => ({
    invalidate: channel => current.current?.invalidate(channel),
    run: (channel, operation, runOptions) => current.current?.run(channel, operation, runOptions)
      ?? Promise.reject(new Error(`${configuration.name} is not mounted`)),
  }))
  return operations
}
