import type {
  ConfigurationAdapter,
  ConfigurationAdapterEvent,
} from './configuration-store'
import { deferred } from '@memorilo/effect-lifecycle/testing'
import * as Schema from 'effect/Schema'
import { describe, expect, it, vi } from 'vitest'

import { defineConfiguration } from './configuration-definition'
import { createConfigurationStore } from './configuration-store'

const TestConfiguration = Schema.Struct({
  editor: Schema.Struct({
    autosaveDelayMs: Schema.Number.check(
      Schema.isInt(),
      Schema.isBetween({ maximum: 2_000, minimum: 100 }),
    ),
    inspectorVisible: Schema.Boolean,
  }),
  workspace: Schema.Struct({ sidebarVisible: Schema.Boolean }),
})

type TestConfigurationValue = typeof TestConfiguration.Type

class MemoryAdapter implements ConfigurationAdapter {
  echoWrites = false
  externalChangeDuringSubscribe: unknown | undefined
  readonly writes: unknown[] = []
  setValue?: ConfigurationAdapter['setValue']
  unsubscribeCalls = 0
  unsubscribeFailures = 0
  private lastListener: ((event: ConfigurationAdapterEvent) => void) | undefined
  private listener: ((event: ConfigurationAdapterEvent) => void) | undefined

  constructor(private value: unknown | null) {}

  emitExternal(value: unknown): void {
    this.value = value
    this.listener?.({ type: 'changed' })
  }

  replaceSilently(value: unknown): void {
    this.value = structuredClone(value)
  }

  emitLateNotification(): void {
    this.lastListener?.({ type: 'changed' })
  }

  emitWatcherFailure(error: unknown): void {
    this.listener?.({ error, type: 'failed' })
  }

  emitLateWatcherFailure(error: unknown): void {
    this.lastListener?.({ error, type: 'failed' })
  }

  async read(): Promise<unknown | null> {
    return structuredClone(this.value)
  }

  subscribe(listener: (event: ConfigurationAdapterEvent) => void): VoidFunction {
    this.listener = listener
    this.lastListener = listener
    if (this.externalChangeDuringSubscribe !== undefined)
      this.value = structuredClone(this.externalChangeDuringSubscribe)
    return () => {
      this.unsubscribeCalls += 1
      if (this.unsubscribeFailures > 0) {
        this.unsubscribeFailures -= 1
        throw new Error('watcher busy')
      }
      if (this.listener === listener)
        this.listener = undefined
    }
  }

  async write(value: unknown): Promise<void> {
    this.value = structuredClone(value)
    this.writes.push(structuredClone(value))
    if (this.echoWrites)
      this.listener?.({ type: 'changed' })
  }
}

const definition = defineConfiguration({
  defaults: {
    editor: { autosaveDelayMs: 250, inspectorVisible: true },
    workspace: { sidebarVisible: true },
  },
  id: 'test',
  schema: TestConfiguration,
  sections: [{
    fields: [
      { control: 'number', label: 'Autosave delay', max: 2_000, min: 100, path: 'editor.autosaveDelayMs', step: 50 },
      { control: 'toggle', label: 'Inspector', path: 'editor.inspectorVisible' },
    ],
    id: 'editor',
    label: 'Editor',
  }],
})

describe('configuration store', () => {
  it('persists validated defaults when storage is empty', async () => {
    const adapter = new MemoryAdapter(null)

    const store = await createConfigurationStore(definition, adapter)

    expect(store.getSnapshot()).toEqual(definition.defaults)
    expect(adapter.writes).toEqual([definition.defaults])
    await store.close()
  })

  it('rejects invalid stored configuration instead of masking it with defaults', async () => {
    const adapter = new MemoryAdapter({
      editor: { autosaveDelayMs: 0, inspectorVisible: true },
      workspace: { sidebarVisible: true },
    })

    await expect(createConfigurationStore(definition, adapter)).rejects.toThrow()
    expect(adapter.writes).toEqual([])
  })

  it('validates updates, persists them, and notifies subscribers with the new snapshot', async () => {
    const adapter = new MemoryAdapter(definition.defaults)
    const store = await createConfigurationStore(definition, adapter)
    const snapshots: TestConfigurationValue[] = []
    const unsubscribe = store.subscribe(() => snapshots.push(store.getSnapshot()))

    await store.setValue('editor.autosaveDelayMs', 600)

    expect(store.getSnapshot().editor.autosaveDelayMs).toBe(600)
    expect(adapter.writes).toEqual([{
      editor: { autosaveDelayMs: 600, inspectorVisible: true },
      workspace: { sidebarVisible: true },
    }])
    expect(snapshots).toEqual([store.getSnapshot()])
    await expect(store.setValue('editor.autosaveDelayMs', 50)).rejects.toThrow()
    expect(adapter.writes).toHaveLength(1)
    unsubscribe()
    await store.close()
  })

  it('serializes field updates against the latest committed snapshot', async () => {
    const adapter = new MemoryAdapter(definition.defaults)
    const store = await createConfigurationStore(definition, adapter)

    await Promise.all([
      store.setValue('editor.inspectorVisible', false),
      store.setValue('workspace.sidebarVisible', false),
    ])

    expect(store.getSnapshot()).toEqual({
      editor: { autosaveDelayMs: 250, inspectorVisible: false },
      workspace: { sidebarVisible: false },
    })
    await store.close()
  })

  it('preserves external fields when a generic adapter has not delivered its watcher event', async () => {
    const adapter = new MemoryAdapter(definition.defaults)
    const store = await createConfigurationStore(definition, adapter)

    adapter.replaceSilently({
      editor: { autosaveDelayMs: 250, inspectorVisible: true },
      workspace: { sidebarVisible: false },
    })

    await store.setValue('editor.inspectorVisible', false)

    expect(store.getSnapshot()).toEqual({
      editor: { autosaveDelayMs: 250, inspectorVisible: false },
      workspace: { sidebarVisible: false },
    })
    expect(adapter.writes.at(-1)).toEqual(store.getSnapshot())
    await store.close()
  })

  it('publishes the authoritative result of a delegated field update', async () => {
    const adapter = new MemoryAdapter(definition.defaults)
    adapter.setValue = vi.fn(async () => ({
      editor: { autosaveDelayMs: 250, inspectorVisible: false },
      workspace: { sidebarVisible: false },
    }))
    const store = await createConfigurationStore(definition, adapter)

    await store.setValue('editor.inspectorVisible', false)

    expect(adapter.setValue).toHaveBeenCalledWith('editor.inspectorVisible', false)
    expect(adapter.writes).toEqual([])
    expect(store.getSnapshot()).toEqual({
      editor: { autosaveDelayMs: 250, inspectorVisible: false },
      workspace: { sidebarVisible: false },
    })
    await store.close()
  })

  it('waits for accepted writes before closing', async () => {
    let releaseWrite!: () => void
    const writeReleased = new Promise<void>((resolve) => {
      releaseWrite = resolve
    })
    let writeStarted!: () => void
    const writeStartedSignal = new Promise<void>((resolve) => {
      writeStarted = resolve
    })
    const adapter = new MemoryAdapter(definition.defaults)
    vi.spyOn(adapter, 'write').mockImplementation(async (value) => {
      writeStarted()
      await writeReleased
      adapter.writes.push(structuredClone(value))
    })
    const store = await createConfigurationStore(definition, adapter)

    const update = store.setValue('editor.inspectorVisible', false)
    await writeStartedSignal
    let closed = false
    const close = store.close().then(() => {
      closed = true
    })

    await Promise.resolve()
    expect(closed).toBe(false)
    releaseWrite()
    await expect(update).resolves.toMatchObject({ editor: { inspectorVisible: false } })
    await close
    expect(closed).toBe(true)
  })

  it('rejects operations after closing while draining accepted work', async () => {
    const adapter = new MemoryAdapter(definition.defaults)
    const store = await createConfigurationStore(definition, adapter)

    await store.close()

    await expect(store.refresh()).rejects.toThrow('Configuration store test is closed')
    await expect(store.set(definition.defaults)).rejects.toThrow('Configuration store test is closed')
    await expect(store.setValue('editor.inspectorVisible', false)).rejects.toThrow('Configuration store test is closed')
  })

  it('makes concurrent close calls wait for the same drain', async () => {
    let releaseWrite!: () => void
    const writeReleased = new Promise<void>((resolve) => {
      releaseWrite = resolve
    })
    let writeStarted!: () => void
    const writeStartedSignal = new Promise<void>((resolve) => {
      writeStarted = resolve
    })
    const adapter = new MemoryAdapter(definition.defaults)
    vi.spyOn(adapter, 'write').mockImplementation(async (value) => {
      writeStarted()
      await writeReleased
      adapter.writes.push(structuredClone(value))
    })
    const store = await createConfigurationStore(definition, adapter)

    const update = store.setValue('editor.inspectorVisible', false)
    await writeStartedSignal
    const firstClose = store.close()
    const secondClose = store.close()
    expect(secondClose).toBe(firstClose)
    let secondFinished = false
    void secondClose.then(() => {
      secondFinished = true
    })

    await Promise.resolve()
    expect(secondFinished).toBe(false)
    releaseWrite()
    await update
    await Promise.all([firstClose, secondClose])
    expect(secondFinished).toBe(true)
  })

  it('retries adapter unsubscription after a failed close', async () => {
    const adapter = new MemoryAdapter(definition.defaults)
    adapter.unsubscribeFailures = 1
    const store = await createConfigurationStore(definition, adapter)

    await expect(store.close()).rejects.toThrow('Configuration store test resource cleanup failed')
    await expect(store.close()).resolves.toBeUndefined()
    expect(adapter.unsubscribeCalls).toBe(2)
  })

  it('rolls back the operation lane when watcher acquisition fails', async () => {
    const pendingRefresh = deferred<unknown>()
    const subscriptionFailure = new Error('watcher unavailable')
    let reads = 0
    const adapter: ConfigurationAdapter = {
      read: vi.fn(() => {
        reads += 1
        return reads === 1
          ? Promise.resolve(structuredClone(definition.defaults))
          : pendingRefresh.promise
      }),
      subscribe: (listener) => {
        listener({ type: 'changed' })
        throw subscriptionFailure
      },
      write: vi.fn(async () => undefined),
    }

    const creating = createConfigurationStore(definition, adapter)
    await vi.waitFor(() => expect(adapter.read).toHaveBeenCalledTimes(2))
    let settled = false
    void creating.then(
      () => { settled = true },
      () => { settled = true },
    )
    await Promise.resolve()
    expect(settled).toBe(false)

    pendingRefresh.resolve(definition.defaults)
    await expect(creating).rejects.toBe(subscriptionFailure)
  })

  it('ignores watcher notifications that were already scheduled when close unsubscribed', async () => {
    const adapter = new MemoryAdapter(definition.defaults)
    const onError = vi.fn()
    const store = await createConfigurationStore(definition, adapter, { onError })

    await store.close()
    adapter.emitLateNotification()
    await Promise.resolve()

    expect(onError).not.toHaveBeenCalled()
  })

  it('reports watcher failures without changing the snapshot and ignores failures after close', async () => {
    const adapter = new MemoryAdapter(definition.defaults)
    const onError = vi.fn()
    const store = await createConfigurationStore(definition, adapter, { onError })
    const failure = new Error('configuration watcher failed')

    adapter.emitWatcherFailure(failure)

    expect(onError).toHaveBeenCalledWith(failure)
    expect(store.getSnapshot()).toEqual(definition.defaults)

    await store.close()
    adapter.emitLateWatcherFailure(new Error('late watcher failure'))
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('hot reloads an external change and ignores an equivalent file-system echo', async () => {
    const adapter = new MemoryAdapter(definition.defaults)
    const store = await createConfigurationStore(definition, adapter)
    const listener = vi.fn()
    store.subscribe(listener)

    adapter.emitExternal({
      editor: { autosaveDelayMs: 400, inspectorVisible: false },
      workspace: { sidebarVisible: true },
    })
    await vi.waitFor(() => expect(store.getSnapshot().editor.inspectorVisible).toBe(false))
    expect(listener).toHaveBeenCalledTimes(1)

    adapter.emitExternal(store.getSnapshot())
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(listener).toHaveBeenCalledTimes(1)
    await store.close()
  })

  it('reports an invalid hot update and preserves the last valid snapshot', async () => {
    const adapter = new MemoryAdapter(definition.defaults)
    const onError = vi.fn()
    const store = await createConfigurationStore(definition, adapter, { onError })

    adapter.emitExternal({
      editor: { autosaveDelayMs: 'fast', inspectorVisible: false },
      workspace: { sidebarVisible: true },
    })

    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1))
    expect(store.getSnapshot()).toEqual(definition.defaults)
    await store.close()
  })

  it('observes an external update made while the storage subscription is being established', async () => {
    const adapter = new MemoryAdapter(definition.defaults)
    adapter.externalChangeDuringSubscribe = {
      editor: { autosaveDelayMs: 450, inspectorVisible: false },
      workspace: { sidebarVisible: true },
    }

    const store = await createConfigurationStore(definition, adapter)

    expect(store.getSnapshot()).toEqual(adapter.externalChangeDuringSubscribe)
    await store.close()
  })

  it('releases the watcher when the startup refresh rejects an external value', async () => {
    const adapter = new MemoryAdapter(definition.defaults)
    const onError = vi.fn()
    adapter.externalChangeDuringSubscribe = {
      editor: { autosaveDelayMs: 0, inspectorVisible: false },
      workspace: { sidebarVisible: true },
    }

    await expect(createConfigurationStore(definition, adapter, { onError })).rejects.toThrow()

    expect(adapter.unsubscribeCalls).toBe(1)
    adapter.emitLateNotification()
    expect(onError).not.toHaveBeenCalled()
  })

  it('aggregates startup refresh and watcher rollback failures', async () => {
    const adapter = new MemoryAdapter(definition.defaults)
    const onError = vi.fn()
    adapter.externalChangeDuringSubscribe = {
      editor: { autosaveDelayMs: 0, inspectorVisible: false },
      workspace: { sidebarVisible: true },
    }
    adapter.unsubscribeFailures = 1

    const error = await createConfigurationStore(definition, adapter, { onError }).catch(cause => cause)

    expect(error).toBeInstanceOf(AggregateError)
    expect(error).toMatchObject({
      message: 'Configuration store test startup and resource rollback failed',
    })
    expect((error as AggregateError).errors).toEqual([
      expect.anything(),
      expect.objectContaining({ message: 'Failed to close Configuration store test watcher' }),
    ])
    expect(adapter.unsubscribeCalls).toBe(1)
    adapter.emitLateNotification()
    expect(onError).not.toHaveBeenCalled()
  })

  it('serializes a synchronous watcher echo behind the write that caused it', async () => {
    const adapter = new MemoryAdapter(definition.defaults)
    adapter.echoWrites = true
    const store = await createConfigurationStore(definition, adapter)
    const listener = vi.fn()
    store.subscribe(listener)

    await store.setValue('editor.inspectorVisible', false)
    await store.close()

    expect(store.getSnapshot().editor.inspectorVisible).toBe(false)
    expect(listener).toHaveBeenCalledOnce()
  })

  it('commits updates and notifies later listeners when one listener fails', async () => {
    const adapter = new MemoryAdapter(definition.defaults)
    const onError = vi.fn()
    const store = await createConfigurationStore(definition, adapter, { onError })
    const failedListener = vi.fn(() => {
      throw new Error('renderer notification failed')
    })
    const laterListener = vi.fn()
    store.subscribe(failedListener)
    store.subscribe(laterListener)

    await expect(store.setValue('editor.inspectorVisible', false)).resolves.toMatchObject({
      editor: { inspectorVisible: false },
    })
    expect(laterListener).toHaveBeenCalledOnce()
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'renderer notification failed' }))
    expect(store.getSnapshot().editor.inspectorVisible).toBe(false)
    await store.close()
  })
})
