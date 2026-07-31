import type * as Schema from 'effect/Schema'
import type { ConfigurationDefinition } from './configuration-definition'
import * as EffectSchema from 'effect/Schema'
import { setConfigurationValue } from './configuration-path'

export interface ConfigurationAdapter {
  read: () => Promise<unknown | null>
  subscribe?: (listener: () => void) => () => void
  write: (configuration: unknown) => Promise<void>
}

export interface ConfigurationStore<T extends object> {
  close: () => void
  getSnapshot: () => T
  refresh: () => Promise<T>
  set: (configuration: unknown) => Promise<T>
  setValue: (path: string, value: unknown) => Promise<T>
  subscribe: (listener: () => void) => () => void
}

export interface CreateConfigurationStoreOptions {
  onError?: (error: unknown) => void
  persistDefaults?: boolean
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value))
    return value
  Object.freeze(value)
  for (const child of Object.values(value))
    deepFreeze(child)
  return value
}

function configurationEquals(left: unknown, right: unknown): boolean {
  if (Object.is(left, right))
    return true
  if (typeof left !== 'object' || left === null || typeof right !== 'object' || right === null)
    return false
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length)
      return false
    return left.every((item, index) => configurationEquals(item, right[index]))
  }

  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const leftKeys = Object.keys(leftRecord)
  const rightKeys = Object.keys(rightRecord)
  return leftKeys.length === rightKeys.length
    && leftKeys.every(key => key in rightRecord && configurationEquals(leftRecord[key], rightRecord[key]))
}

export async function createConfigurationStore<S extends Schema.Top & {
  readonly DecodingServices: never
  readonly Type: object
}>(
  definition: ConfigurationDefinition<S>,
  adapter: ConfigurationAdapter,
  options: CreateConfigurationStoreOptions = {},
): Promise<ConfigurationStore<S['Type'] & object>> {
  type Configuration = S['Type'] & object
  const decode = EffectSchema.decodeUnknownSync(definition.schema)
  const stored = await adapter.read()
  let snapshot: Configuration = deepFreeze(decode(stored === null ? definition.defaults : stored, {
    onExcessProperty: 'error',
  }) as Configuration)
  if (stored === null && options.persistDefaults !== false)
    await adapter.write(snapshot)

  let closed = false
  let operationTail: Promise<void> = Promise.resolve()
  const listeners = new Set<() => void>()

  const publish = (next: Configuration): Configuration => {
    const frozen = deepFreeze(next)
    if (configurationEquals(snapshot, frozen))
      return snapshot
    snapshot = frozen
    listeners.forEach(listener => listener())
    return snapshot
  }

  const enqueue = <R>(operation: () => Promise<R>): Promise<R> => {
    const result = operationTail.then(operation)
    operationTail = result.then(() => undefined, () => undefined)
    return result
  }

  const assertOpen = (): void => {
    if (closed)
      throw new Error(`Configuration store ${definition.id} is closed`)
  }

  const refresh = (): Promise<Configuration> => {
    assertOpen()
    return enqueue(async () => {
      const next = await adapter.read()
      if (next === null)
        throw new Error(`Configuration ${definition.id} disappeared from storage`)
      return publish(decode(next, { onExcessProperty: 'error' }) as Configuration)
    })
  }

  const unsubscribeAdapter = adapter.subscribe?.(() => {
    void refresh().catch((error) => {
      if (options.onError)
        options.onError(error)
      else
        console.error(`Failed to hot reload configuration ${definition.id}`, error)
    })
  })

  const store: ConfigurationStore<Configuration> = {
    close: () => {
      if (closed)
        return
      closed = true
      unsubscribeAdapter?.()
      listeners.clear()
    },
    getSnapshot: () => snapshot,
    refresh,
    set: async (configuration) => {
      assertOpen()
      const next = decode(configuration, { onExcessProperty: 'error' }) as Configuration
      return enqueue(async () => {
        await adapter.write(next)
        return publish(next)
      })
    },
    setValue: async (path, value) => {
      assertOpen()
      return enqueue(async () => {
        const next = decode(
          setConfigurationValue(snapshot, path, value),
          { onExcessProperty: 'error' },
        ) as Configuration
        await adapter.write(next)
        return publish(next)
      })
    },
    subscribe: (listener) => {
      assertOpen()
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }

  return store
}
