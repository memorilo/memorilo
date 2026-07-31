import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createJsonFileConfigurationAdapter } from './json-file-adapter'

const temporaryDirectories: string[] = []

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
    const unsubscribe = adapter.subscribe(listener)

    await writeFile(path, '{"enabled":false}\n', 'utf8')

    await vi.waitFor(() => expect(listener).toHaveBeenCalled())
    expect(await adapter.read()).toEqual({ enabled: false })
    unsubscribe()
  })
})
