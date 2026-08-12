import type { EditorStorage } from '@memorilo/editor-storage'
import { Buffer } from 'node:buffer'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterEach, describe, expect, it, vi } from 'vitest'

const netFetch = vi.fn()

vi.mock('electron', () => ({
  BrowserWindow: { fromWebContents: vi.fn() },
  dialog: { showMessageBox: vi.fn() },
  net: { fetch: netFetch },
  shell: { trashItem: vi.fn() },
}))

const { createAssetHandlers } = await import('./asset-service')
const temporaryDirectories: string[] = []

function storageWithRegister(register: EditorStorage['assets']['register']): EditorStorage {
  return { assets: { register } } as unknown as EditorStorage
}
const tiffImage = Buffer.from(
  'SUkqAIAAAAD/2P/AABEIAAEAAgMBIgACEQEDEQH/xABMAAEBAAAAAAAAAAAAAAAAAAAABxABAAAAAAAAAAAAAAAAAAAAAAEBAQAAAAAAAAAAAAAAAAAABggRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJ0ADKpf/9kRAAABAwABAAAAAgAAAAEBAwABAAAAAQAAAAIBAwADAAAAYgEAAAMBAwABAAAABwAAAAYBAwABAAAABgAAABEBBAABAAAACAAAABIBAwABAAAAAQAAABUBAwABAAAAAwAAABYBAwABAAAAAAEAABcBBAABAAAAeAAAABoBBQABAAAAUgEAABsBBQABAAAAWgEAABwBAwABAAAAAQAAACgBAwABAAAAAgAAAFMBAwADAAAAaAEAAFsBBwCOAAAAngEAABQCBQAGAAAAbgEAAAAAAAAzM8sAAAAIADMzywAAAAgACAAIAAgAAQABAAEAAAAAAAEAAAD/AAAAAQAAAIAAAAABAAAA/wAAAAEAAACAAAAAAQAAAP8AAAABAAAA/9j/2wBDAAYGBgYHBgcICAcKCwoLCg8ODAwODxYQERAREBYiFRkVFRkVIh4kHhweJB42KiYmKjY+NDI0PkxERExfWl98fKf/2wBDAQYGBgYHBgcICAcKCwoLCg8ODAwODxYQERAREBYiFRkVFRkVIh4kHhweJB42KiYmKjY+NDI0PkxERExfWl98fKf/2Q==',
  'base64',
)

function configuration(tiffConversionFormat: 'avif' | 'jpeg' | 'png' | 'webp' = 'webp') {
  return {
    getSnapshot: () => ({ tiffConversionFormat }),
  }
}

afterEach(async () => {
  vi.clearAllMocks()
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { force: true, recursive: true })))
})

describe('asset service', () => {
  it('downloads and registers a network image', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'memorilo-network-image-'))
    temporaryDirectories.push(directory)
    const registerAsset = vi.fn(async input => input)
    netFetch.mockResolvedValueOnce(new Response(
      Uint8Array.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
      {
        headers: { 'Content-Type': 'image/png; charset=binary' },
        status: 200,
      },
    ))
    const handlers = createAssetHandlers(
      directory,
      storageWithRegister(registerAsset),
      configuration() as never,
      operation => operation(),
    )

    const saved = await handlers.importNetworkImage({ source: 'https://example.com/photo.png' })
    const fileName = new URL(saved.src).pathname.slice(1)

    expect(netFetch).toHaveBeenCalledWith('https://example.com/photo.png')
    expect(registerAsset).toHaveBeenCalledWith({
      byteSize: 8,
      fileName,
      mimeType: 'image/png',
      originalFileName: 'photo.png',
    })
    await expect(readFile(join(directory, fileName))).resolves.toEqual(
      Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    )
  })

  it.each([
    ['file:///tmp/image.png', 'Network images must use HTTP or HTTPS'],
    ['not a URL', 'Invalid URL'],
  ])('rejects unsupported network image source %s', async (source, message) => {
    const handlers = createAssetHandlers(
      null,
      {} as EditorStorage,
      configuration() as never,
      operation => operation(),
    )

    await expect(handlers.importNetworkImage({ source })).rejects.toThrow(message)
    expect(netFetch).not.toHaveBeenCalled()
  })

  it('rejects a network response that is not an image', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'memorilo-network-non-image-'))
    temporaryDirectories.push(directory)
    netFetch.mockResolvedValueOnce(new Response('hello', {
      headers: { 'Content-Type': 'text/plain' },
      status: 200,
    }))
    const handlers = createAssetHandlers(
      directory,
      {} as EditorStorage,
      configuration() as never,
      operation => operation(),
    )

    await expect(
      handlers.importNetworkImage({ source: 'https://example.com/file' }),
    ).rejects.toThrow('Remote URL did not return an image: text/plain')
  })

  it('rejects an oversized streaming network response', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'memorilo-network-oversized-'))
    temporaryDirectories.push(directory)
    const oversizedChunk = new Uint8Array(50 * 1024 * 1024 + 1)
    netFetch.mockResolvedValueOnce(new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(oversizedChunk)
        controller.close()
      },
    }), {
      headers: { 'Content-Type': 'image/png' },
      status: 200,
    }))
    const handlers = createAssetHandlers(
      directory,
      {} as EditorStorage,
      configuration() as never,
      operation => operation(),
    )

    await expect(
      handlers.importNetworkImage({ source: 'https://example.com/large.png' }),
    ).rejects.toThrow('Image must not exceed 50 MiB')
  })

  it('serializes the complete image save with other asset operations', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'memorilo-save-image-'))
    temporaryDirectories.push(directory)
    let release!: () => void
    const previousOperation = new Promise<void>((resolve) => {
      release = resolve
    })
    const operations: Array<() => Promise<unknown>> = []
    const serialize = <Result>(operation: () => Promise<Result>): Promise<Result> => {
      operations.push(operation)
      return previousOperation.then(operation)
    }
    const registerAsset = vi.fn(async () => ({
      byteSize: 8,
      createdAt: 1,
      fileName: 'unused.png',
      mimeType: 'image/png',
      originalFileName: 'photo.png',
    }))
    const handlers = createAssetHandlers(
      directory,
      storageWithRegister(registerAsset),
      configuration() as never,
      serialize,
    )
    const saved = handlers.saveImage({
      data: Uint8Array.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
      fileName: 'photo.png',
      mimeType: 'image/png',
    })
    await Promise.resolve()

    expect(operations).toHaveLength(1)
    expect(registerAsset).not.toHaveBeenCalled()

    release()
    await expect(saved).resolves.toMatchObject({ src: expect.stringMatching(/^memorilo-asset:\/\/\/.+\.png$/) })
    expect(registerAsset).toHaveBeenCalledOnce()
  })

  it('applies TIFF orientation metadata during conversion', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'memorilo-orient-tiff-'))
    temporaryDirectories.push(directory)
    const orientedTiff = await sharp({
      create: { background: 'red', channels: 3, height: 1, width: 2 },
    }).tiff().withMetadata({ orientation: 6 }).toBuffer()
    const handlers = createAssetHandlers(
      directory,
      storageWithRegister(vi.fn(async input => input)),
      configuration() as never,
      operation => operation(),
    )

    const saved = await handlers.saveImage({
      data: orientedTiff,
      fileName: 'oriented.tiff',
      mimeType: 'image/tiff',
    })
    const output = await readFile(join(directory, new URL(saved.src).pathname.slice(1)))

    await expect(sharp(output).metadata()).resolves.toMatchObject({ height: 2, width: 1 })
  })

  it.each([
    ['webp', 'image/webp', '.webp'],
    ['png', 'image/png', '.png'],
    ['jpeg', 'image/jpeg', '.jpg'],
    ['avif', 'image/avif', '.avif'],
  ] as const)('converts TIFF uploads to configured %s assets', async (format, mimeType, extension) => {
    const directory = await mkdtemp(join(tmpdir(), 'memorilo-convert-tiff-'))
    temporaryDirectories.push(directory)
    const registerAsset = vi.fn(async input => input)
    const handlers = createAssetHandlers(
      directory,
      storageWithRegister(registerAsset),
      configuration(format) as never,
      operation => operation(),
    )

    const saved = await handlers.saveImage({
      data: tiffImage,
      fileName: 'scan.tiff',
      mimeType: 'image/tiff',
    })
    expect(saved.src).toMatch(new RegExp(`^memorilo-asset:\\/\\/.+\\${extension}$`))
    const fileName = new URL(saved.src).pathname.slice(1)
    const output = await readFile(join(directory, fileName))
    const metadata = await sharp(output).metadata()

    expect(metadata.format).toBe(format === 'avif' ? 'heif' : format)
    expect(metadata.width).toBe(2)
    expect(metadata.height).toBe(1)
    expect(registerAsset).toHaveBeenCalledWith({
      byteSize: output.byteLength,
      fileName,
      mimeType,
      originalFileName: 'scan.tiff',
    })
  })
})
