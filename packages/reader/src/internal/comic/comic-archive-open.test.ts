import type { FileEntry } from '@zip.js/zip.js'
import type { ResolvedReaderSource } from '../source'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openComicArchive } from './comic-archive'

const harness = vi.hoisted(() => ({
  close: vi.fn(async () => undefined),
  entries: [] as FileEntry[],
}))

vi.mock('@zip.js/zip.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@zip.js/zip.js')>()
  return {
    ...actual,
    ZipReader: class FakeZipReader {
      close(): Promise<void> {
        return harness.close()
      }

      getEntries(): Promise<FileEntry[]> {
        return Promise.resolve(harness.entries)
      }
    },
  }
})

function entry(name: string): FileEntry {
  return {
    directory: false,
    encrypted: false,
    filename: name,
    getData: vi.fn(async () => new Blob(['x'], { type: 'image/png' })),
    uncompressedSize: 1,
  } as unknown as FileEntry
}

function source(): ResolvedReaderSource & { format: 'cbz' } {
  return {
    byteLength: 1,
    format: 'cbz',
    name: 'test.cbz',
    read: vi.fn(async () => new Uint8Array([0])),
  }
}

afterEach(() => {
  harness.close.mockReset().mockResolvedValue(undefined)
  harness.entries = []
})

describe('comic ZIP archive catalog', () => {
  it('uses deterministic natural page ordering', async () => {
    harness.entries = [entry('page-10.png'), entry('page-2.png'), entry('page-1.png')]

    const archive = await openComicArchive(source())

    expect(archive.pages.map(page => page.name)).toEqual([
      'page-1.png',
      'page-2.png',
      'page-10.png',
    ])
    await archive.close()
  })

  it('rejects duplicate entry names instead of aliasing pages', async () => {
    harness.entries = [entry('page.png'), entry('page.png')]

    await expect(openComicArchive(source())).rejects.toThrow(
      'The comic archive contains a duplicate entry: page.png',
    )
    expect(harness.close).toHaveBeenCalledOnce()
  })

  it('aggregates catalog and ZIP cleanup failures', async () => {
    const cleanupError = new Error('ZIP close failed')
    harness.entries = [entry('page.png'), entry('page.png')]
    harness.close.mockRejectedValueOnce(cleanupError)

    const failure = openComicArchive(source())
    await expect(failure).rejects.toBeInstanceOf(AggregateError)
    const error = await failure.catch(reason => reason)
    if (!(error instanceof AggregateError))
      throw error
    expect(error.errors).toContain(cleanupError)
  })
})
