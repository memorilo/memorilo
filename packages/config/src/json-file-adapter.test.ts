import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import * as Schema from 'effect/Schema'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { defineConfiguration } from './configuration-definition'
import { createConfigurationStore } from './configuration-store'
import { createJsonFileConfigurationAdapter } from './json-file-adapter'

const temporaryDirectories: string[] = []

const fileDefinition = defineConfiguration({
  defaults: {
    editor: { inspectorVisible: true },
    workspace: { sidebarVisible: true },
  },
  id: 'file-race',
  schema: Schema.Struct({
    editor: Schema.Struct({ inspectorVisible: Schema.Boolean }),
    workspace: Schema.Struct({ sidebarVisible: Schema.Boolean }),
  }),
  sections: [],
})

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { force: true, recursive: true })))
})

async function temporaryPath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'memorilo-config-'))
  temporaryDirectories.push(directory)
  return join(directory, 'nested', 'configuration.json')
}

describe('json file configuration adapter', () => {
  it('writes formatted JSON atomically and reads it back', async () => {
    const path = await temporaryPath()
    const adapter = createJsonFileConfigurationAdapter(path)

    await adapter.write({ enabled: true, interval: 300 })

    expect(await adapter.read()).toEqual({ enabled: true, interval: 300 })
    expect(await readFile(path, 'utf8')).toBe('{\n  "enabled": true,\n  "interval": 300\n}\n')
  })

  it('notifies subscribers when another process replaces the file', async () => {
    const path = await temporaryPath()
    const adapter = createJsonFileConfigurationAdapter(path, { debounceMs: 5 })
    await adapter.write({ enabled: true })
    const listener = vi.fn()
    if (!adapter.subscribe)
      throw new Error('JSON file adapter must support subscriptions')
    const unsubscribe = await adapter.subscribe(listener)

    await writeFile(path, '{"enabled":false}\n', 'utf8')

    await vi.waitFor(() => expect(listener).toHaveBeenCalled())
    expect(await adapter.read()).toEqual({ enabled: false })
    unsubscribe()
  })

  it('preserves external fields changed before a local field update', async () => {
    const path = await temporaryPath()
    const adapter = createJsonFileConfigurationAdapter(path, { debounceMs: 10_000 })
    const store = await createConfigurationStore(fileDefinition, adapter)

    await writeFile(path, JSON.stringify({
      editor: { inspectorVisible: true },
      workspace: { sidebarVisible: false },
    }), 'utf8')
    await store.setValue('editor.inspectorVisible', false)

    expect(store.getSnapshot()).toEqual({
      editor: { inspectorVisible: false },
      workspace: { sidebarVisible: false },
    })
    expect(await adapter.read()).toEqual(store.getSnapshot())
    await store.close()
  })

  it('serializes migration and field updates in the same shared file lane', async () => {
    const path = await temporaryPath()
    const migrate = (configuration: unknown): unknown => {
      const current = configuration as {
        editor: { inspectorVisible: boolean }
        version?: number
        workspace: { sidebarVisible: boolean }
      }
      return current.version === 1 ? current : { ...current, version: 1 }
    }
    const first = createJsonFileConfigurationAdapter(path, { migrate })
    const second = createJsonFileConfigurationAdapter(path, { migrate })
    await first.write({
      editor: { inspectorVisible: true },
      workspace: { sidebarVisible: true },
    })
    if (!second.setValue)
      throw new Error('JSON file adapter must support field updates')

    await Promise.all([
      first.read(),
      second.setValue('workspace.sidebarVisible', false),
    ])

    expect(await first.read()).toEqual({
      editor: { inspectorVisible: true },
      version: 1,
      workspace: { sidebarVisible: false },
    })
  })

  it('watches an initially missing file without persisting defaults', async () => {
    const path = await temporaryPath()
    const adapter = createJsonFileConfigurationAdapter(path, { debounceMs: 5 })
    const store = await createConfigurationStore(fileDefinition, adapter, { persistDefaults: false })
    const listener = vi.fn()
    store.subscribe(listener)

    await writeFile(path, JSON.stringify({
      editor: { inspectorVisible: false },
      workspace: { sidebarVisible: true },
    }), 'utf8')

    await vi.waitFor(() => expect(store.getSnapshot().editor.inspectorVisible).toBe(false))
    expect(listener).toHaveBeenCalledOnce()
    await store.close()
  })

  it('cancels a debounced notification when its watcher is closed', async () => {
    const path = await temporaryPath()
    const adapter = createJsonFileConfigurationAdapter(path, { debounceMs: 30 })
    await adapter.write({ enabled: true })
    const listener = vi.fn()
    if (!adapter.subscribe)
      throw new Error('JSON file adapter must support subscriptions')
    const unsubscribe = await adapter.subscribe(listener)

    await writeFile(path, '{"enabled":false}\n', 'utf8')
    await new Promise(resolve => setTimeout(resolve, 5))
    unsubscribe()
    await new Promise(resolve => setTimeout(resolve, 40))

    expect(listener).not.toHaveBeenCalled()
  })

  it('preserves concurrent field updates from independent file adapters', async () => {
    const path = await temporaryPath()
    const first = createJsonFileConfigurationAdapter(path)
    const second = createJsonFileConfigurationAdapter(path)
    if (!first.setValue || !second.setValue)
      throw new Error('JSON file adapters must support field updates')
    await first.write({
      editor: { inspectorVisible: true },
      workspace: { sidebarVisible: true },
    })

    await Promise.all([
      first.setValue('editor.inspectorVisible', false),
      second.setValue('workspace.sidebarVisible', false),
    ])

    expect(await first.read()).toEqual({
      editor: { inspectorVisible: false },
      workspace: { sidebarVisible: false },
    })
  })

  it('releases the shared file lane and removes temporary files after a failed write', async () => {
    const path = await temporaryPath()
    const adapter = createJsonFileConfigurationAdapter(path)
    const circular: { self?: unknown } = {}
    circular.self = circular

    await expect(adapter.write(circular)).rejects.toThrow()
    await expect(adapter.write({ recovered: true })).resolves.toBeUndefined()

    expect(await adapter.read()).toEqual({ recovered: true })
    expect(await readdir(dirname(path))).toEqual(['configuration.json'])
  })
})
