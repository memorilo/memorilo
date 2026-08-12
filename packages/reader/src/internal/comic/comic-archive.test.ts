import type { ComicPage } from './comic-archive'
import { describe, expect, it, vi } from 'vitest'
import { createComicArchive } from './comic-archive'

interface Gate {
  entered: Promise<void>
  release: () => void
  wait: () => Promise<void>
}

function gate(): Gate {
  let enter!: () => void
  let release!: () => void
  const entered = new Promise<void>((resolve) => {
    enter = resolve
  })
  const waiting = new Promise<void>((resolve) => {
    release = resolve
  })
  return {
    entered,
    release,
    wait: async () => {
      enter()
      await waiting
    },
  }
}

const page: ComicPage = { byteSize: 3, mimeType: 'image/png', name: 'page-1.png' }

describe('comic archive lifecycle', () => {
  it('forwards cancellation to the extraction backend', async () => {
    const controller = new AbortController()
    const readPage = vi.fn(async (_page: ComicPage, _signal?: AbortSignal) => {
      return new Blob(['page'], { type: page.mimeType })
    })
    const archive = createComicArchive({
      close: async () => undefined,
      pages: [page],
      readPage,
    })

    await archive.readPage(0, controller.signal)

    expect(readPage).toHaveBeenCalledWith(page, controller.signal)
    await archive.close()
  })

  it('rejects new reads while close drains an accepted extraction', async () => {
    const extraction = gate()
    let backendClosed = false
    const archive = createComicArchive({
      close: async () => {
        backendClosed = true
      },
      pages: [page],
      readPage: async () => {
        await extraction.wait()
        return new Blob(['one'], { type: page.mimeType })
      },
    })

    const reading = archive.readPage(0)
    await extraction.entered
    const closing = archive.close()

    await expect(archive.readPage(0)).rejects.toThrow('Comic archive is closed')
    expect(backendClosed).toBe(false)
    extraction.release()
    await expect(reading).resolves.toBeInstanceOf(Blob)
    await expect(closing).resolves.toBeUndefined()
    expect(backendClosed).toBe(true)
    expect(archive.close()).toBe(closing)
  })

  it('retries backend cleanup without reopening read admission', async () => {
    const cleanupError = new Error('decoder cleanup failed')
    let attempts = 0
    const archive = createComicArchive({
      close: async () => {
        attempts += 1
        if (attempts === 1)
          throw cleanupError
      },
      pages: [page],
      readPage: async () => new Blob(['two'], { type: page.mimeType }),
    })

    const firstClose = archive.close()
    expect(archive.close()).toBe(firstClose)
    const failure = await firstClose.catch(error => error)
    expect(failure).toBeInstanceOf(AggregateError)
    expect((failure as AggregateError).errors).toEqual([
      expect.objectContaining({
        cause: cleanupError,
        message: 'Failed to close archive backend',
      }),
    ])
    await expect(archive.readPage(0)).rejects.toThrow('Comic archive is closed')

    await expect(archive.close()).resolves.toBeUndefined()
    expect(attempts).toBe(2)
  })
})
