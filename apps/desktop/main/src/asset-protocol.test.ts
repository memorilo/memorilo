import type { ProtocolRequest } from 'electron'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const handle = vi.fn()
const unhandle = vi.fn()
vi.mock('electron', () => ({ protocol: { handle, unhandle } }))

const { registerAssetProtocol } = await import('./asset-protocol')
const temporaryDirectories: string[] = []

function registeredHandler(): (request: ProtocolRequest) => Promise<Response> {
  const handler = handle.mock.calls.at(-1)?.[1]
  if (typeof handler !== 'function')
    throw new TypeError('Asset protocol handler was not registered')
  return handler
}

function request(url: string, method = 'GET'): ProtocolRequest {
  return { method, url } as ProtocolRequest
}

afterEach(async () => {
  handle.mockClear()
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { force: true, recursive: true })))
})

describe('asset protocol', () => {
  it('serves canonical and Electron-normalized asset URLs', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'memorilo-asset-protocol-'))
    temporaryDirectories.push(directory)
    const fileName = '123e4567-e89b-42d3-a456-426614174000.png'
    await writeFile(join(directory, fileName), Uint8Array.from([1, 2, 3]))
    await registerAssetProtocol(directory)
    const handler = registeredHandler()

    for (const url of [`memorilo-asset:///${fileName}`, `memorilo-asset://${fileName}/`]) {
      const response = await handler(request(url))
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('image/png')
      expect(response.headers.get('x-content-type-options')).toBe('nosniff')
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(Uint8Array.from([1, 2, 3]))
    }
  })

  it.each([
    [`memorilo-asset:///123e4567-e89b-42d3-a456-426614174000.png?version=1`, 400],
    [`memorilo-asset:///123e4567-e89b-42d3-a456-426614174000.png#preview`, 400],
    [`memorilo-asset://123e4567-e89b-42d3-a456-426614174000.png/nested`, 400],
    ['memorilo-asset:///%E0%A4%A', 400],
    ['memorilo-asset:///not-a-uuid.png', 400],
  ])('rejects an invalid path %s', async (url, status) => {
    await registerAssetProtocol('/tmp')
    expect((await registeredHandler()(request(url))).status).toBe(status)
  })

  it('rejects non-GET methods', async () => {
    await registerAssetProtocol('/tmp')
    expect((await registeredHandler()(request('memorilo-asset:///123e4567-e89b-42d3-a456-426614174000.png', 'POST'))).status).toBe(405)
  })

  it('returns not found when assets are unavailable or missing', async () => {
    await registerAssetProtocol(null)
    expect((await registeredHandler()(request('memorilo-asset:///123e4567-e89b-42d3-a456-426614174000.png'))).status).toBe(404)

    const directory = await mkdtemp(join(tmpdir(), 'memorilo-asset-protocol-'))
    temporaryDirectories.push(directory)
    await registerAssetProtocol(directory)
    expect((await registeredHandler()(request('memorilo-asset:///123e4567-e89b-42d3-a456-426614174000.png'))).status).toBe(404)
  })
})
