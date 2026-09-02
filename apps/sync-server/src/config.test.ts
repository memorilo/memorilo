import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadSyncServerConfig, parseSyncServerConfig } from './config'

describe('sync server configuration', () => {
  const directories: string[] = []

  afterEach(async () => {
    await Promise.all(directories.splice(0).map(directory => rm(directory, { force: true, recursive: true })))
  })

  it('loads a strict JSON file and applies explicit environment overrides', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'memorilo-sync-config-'))
    directories.push(directory)
    const path = join(directory, 'sync-server.json')
    await writeFile(path, JSON.stringify({
      enabledModes: ['authoritative'],
      maintenanceMode: 'read-only',
      port: 6100,
      s3ForcePathStyle: false,
      trustProxy: false,
    }))
    await expect(loadSyncServerConfig({
      MEMORILO_SYNC_SERVER_CONFIG_FILE: path,
      MEMORILO_SYNC_SERVER_PORT: '6200',
    })).resolves.toMatchObject({
      enabledModes: ['authoritative'],
      maintenanceMode: 'read-only',
      port: 6200,
      s3ForcePathStyle: false,
      trustProxy: false,
    })
  })

  it('rejects unknown file keys including the removed peer port', () => {
    expect(() => parseSyncServerConfig({}, { unknownOption: true })).toThrow()
    expect(() => parseSyncServerConfig({}, { peerPort: 6001 })).toThrow()
    expect(() => parseSyncServerConfig({}, { sessionIdleTimeoutMs: 2_000, sessionTotalTimeoutMs: 1_000 })).toThrow('must not be shorter')
  })
})
