import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { desktopConfigurationDefinition } from '@memorilo/desktop-config'
import { afterEach, describe, expect, it } from 'vitest'

import { createDesktopConfigurationAdapter } from './desktop-configuration-adapter'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { force: true, recursive: true })))
})

describe('desktop configuration adapter', () => {
  it('keeps external fields when a renderer field update follows a watcher write', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'memorilo-desktop-configuration-'))
    temporaryDirectories.push(userDataPath)
    const adapter = createDesktopConfigurationAdapter(userDataPath)
    const base = structuredClone(desktopConfigurationDefinition.defaults)

    await adapter.write(base)
    await writeFile(join(userDataPath, 'configuration.json'), JSON.stringify({
      ...base,
      weekStart: 'monday',
    }), 'utf8')

    if (!adapter.setValue)
      throw new Error('Desktop configuration adapter must support field updates')
    const updated = await adapter.setValue('language', 'en')

    expect(updated).toMatchObject({ language: 'en', weekStart: 'monday' })
    expect(await adapter.read()).toMatchObject({ language: 'en', weekStart: 'monday' })
  })

  it('keeps a concurrent field update while migrating a legacy configuration', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'memorilo-desktop-configuration-'))
    temporaryDirectories.push(userDataPath)
    const adapter = createDesktopConfigurationAdapter(userDataPath)
    await adapter.write({ language: 'zh', reduceMotion: true })
    if (!adapter.setValue)
      throw new Error('Desktop configuration adapter must support field updates')

    await Promise.all([
      adapter.read(),
      adapter.setValue('weekStart', 'monday'),
    ])

    expect(await adapter.read()).toEqual({
      ...desktopConfigurationDefinition.defaults,
      language: 'zh',
      reduceMotion: true,
      weekStart: 'monday',
    })
  })
})
