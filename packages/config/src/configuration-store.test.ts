import type { ConfigurationAdapter } from './configuration-store'
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
  readonly writes: unknown[] = []
  private listener: VoidFunction | undefined

  constructor(private value: unknown | null) {}

  emitExternal(value: unknown): void {
    this.value = value
    this.listener?.()
  }

  async read(): Promise<unknown | null> {
    return structuredClone(this.value)
  }

  subscribe(listener: VoidFunction): VoidFunction {
    this.listener = listener
    return () => {
      if (this.listener === listener)
        this.listener = undefined
    }
  }

  async write(value: unknown): Promise<void> {
    this.value = structuredClone(value)
    this.writes.push(structuredClone(value))
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
    store.close()
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
    store.close()
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
    store.close()
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
    store.close()
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
    store.close()
  })
})
