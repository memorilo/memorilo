import type * as Schema from 'effect/Schema'
import type { ConfigurationDefinition } from './configuration-definition'
import {
  createOperationSupervisor,
  createResourceScope,
} from '@memorilo/effect-lifecycle'
import * as EffectSchema from 'effect/Schema'
import { setConfigurationValue } from './configuration-path'

export interface ConfigurationAdapter {
  read: () => Promise<unknown | null>
  setValue?: (path: string, value: unknown) => Promise<unknown>
  subscribe?: (listener: (event: ConfigurationAdapterEvent) => void) => Promise<() => void> | (() => void)
  write: (configuration: unknown) => Promise<void>
}

export type ConfigurationAdapterEvent
  = | { readonly type: 'changed' }
    | { readonly error: unknown, readonly type: 'failed' }

export interface ConfigurationStore<T extends object> {
  close: () => Promise<void>
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
    onExcessProperty: 'preserve',
  }) as Configuration)
  if (stored === null && options.persistDefaults !== false)
    await adapter.write(snapshot)

  let closed = false
  const operations = createOperationSupervisor(
    `Configuration store ${definition.id}`,
    { closedError: () => new Error(`Configuration store ${definition.id} is closed`) },
  )
  const resources = createResourceScope(`Configuration store ${definition.id}`)
  await resources.acquire({
    acquire: () => operations,
    close: owner => owner.close(),
    name: `Configuration store ${definition.id} operations`,
  })
  const listeners = new Set<() => void>()
  const rollback = (startupError: unknown): Promise<never> => {
    closed = true
    listeners.clear()
    return resources.rollback(startupError)
  }

  const reportListenerError = (error: unknown): void => {
    try {
      if (options.onError) {
        options.onError(error)
        return
      }
      console.error(`Configuration listener failed for ${definition.id}`, error)
    }
    catch (reportError) {
      console.error(`Configuration listener error reporting failed for ${definition.id}`, reportError)
    }
  }

  const publish = (next: Configuration): Configuration => {
    const frozen = deepFreeze(next)
    if (configurationEquals(snapshot, frozen))
      return snapshot
    snapshot = frozen
    for (const listener of [...listeners]) {
      try {
        listener()
      }
      catch (error) {
        reportListenerError(error)
      }
    }
    return snapshot
  }

  const assertOpen = (): void => {
    if (closed)
      throw new Error(`Configuration store ${definition.id} is closed`)
  }

  const refreshStored = async (allowMissing: boolean): Promise<Configuration> => {
    assertOpen()
    return operations.run(async () => {
      const next = await adapter.read()
      if (next === null && allowMissing)
        return snapshot
      if (next === null)
        throw new Error(`Configuration ${definition.id} disappeared from storage`)
      return publish(decode(next, { onExcessProperty: 'preserve' }) as Configuration)
    })
  }
  const refresh = (): Promise<Configuration> => refreshStored(false)

  const subscribeAdapter = adapter.subscribe?.bind(adapter)
  let watching = false
  if (subscribeAdapter) {
    try {
      await resources.acquire({
        acquire: () => subscribeAdapter((event) => {
          if (closed)
            return
          if (event.type === 'failed') {
            reportListenerError(event.error)
            return
          }
          void refresh().catch((error) => {
            reportListenerError(error)
          })
        }),
        close: unsubscribe => unsubscribe(),
        name: `Configuration store ${definition.id} watcher`,
      })
      watching = true
    }
    catch (startupError) {
      return rollback(startupError)
    }
  }

  const store: ConfigurationStore<Configuration> = {
    close: () => {
      closed = true
      listeners.clear()
      return resources.close()
    },
    getSnapshot: () => snapshot,
    refresh,
    set: async (configuration) => {
      assertOpen()
      const next = decode(configuration, { onExcessProperty: 'preserve' }) as Configuration
      return operations.run(async () => {
        await adapter.write(next)
        return publish(next)
      })
    },
    setValue: async (path, value) => {
      assertOpen()
      return operations.run(async () => {
        if (adapter.setValue) {
          const persisted = await adapter.setValue(path, value)
          const next = decode(persisted, { onExcessProperty: 'preserve' }) as Configuration
          return publish(next)
        }
        // A watcher notification may still be queued behind this operation.
        // Read the adapter's current value before applying a field update so
        // a stale in-memory snapshot cannot overwrite unrelated external edits.
        const persisted = await adapter.read()
        const base = persisted === null
          ? snapshot
          : decode(persisted, { onExcessProperty: 'preserve' }) as Configuration
        const next = decode(
          setConfigurationValue(base, path, value),
          { onExcessProperty: 'preserve' },
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

  if (watching) {
    try {
      // Close the read-before-subscribe window. Changes after subscribe are
      // queued by the watcher; changes before it are observed by this read.
      await refreshStored(stored === null && options.persistDefaults === false)
    }
    catch (startupError) {
      return rollback(startupError)
    }
  }

  resources.commit()
  return store
}
