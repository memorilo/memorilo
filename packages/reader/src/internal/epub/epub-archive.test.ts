import type { ResolvedReaderSource } from '../source'
import { Link, NumberRange } from '@readium/shared'
import { TextReader, Uint8ArrayWriter, ZipWriter } from '@zip.js/zip.js'
import { describe, expect, it, vi } from 'vitest'
import { EpubArchive } from './epub-archive'

interface ReadGate {
  entered: Promise<void>
  release: () => void
  wait: () => Promise<void>
}

function createReadGate(): ReadGate {
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
    release: () => {
      release()
    },
    wait: async () => {
      enter()
      await waiting
    },
  }
}

async function archiveBytes(entries: Record<string, string> = { 'chapter.txt': 'accepted read' }): Promise<Uint8Array> {
  const writer = new ZipWriter(new Uint8ArrayWriter(), { useWebWorkers: false })
  for (const [path, contents] of Object.entries(entries))
    await writer.add(path, new TextReader(contents), { level: 0 })
  return writer.close()
}

function source(bytes: Uint8Array): {
  gateNextRead: () => ReadGate
  source: ResolvedReaderSource
} {
  let nextGate: ReadGate | undefined
  return {
    gateNextRead: () => {
      const gate = createReadGate()
      nextGate = gate
      return gate
    },
    source: {
      byteLength: bytes.byteLength,
      format: 'epub',
      name: 'test.epub',
      read: async (offset, length) => {
        const gate = nextGate
        nextGate = undefined
        await gate?.wait()
        return bytes.slice(offset, offset + length)
      },
    },
  }
}

describe('epub archive', () => {
  it('rejects new reads while close drains a read that was already accepted', async () => {
    const bytes = await archiveBytes()
    const controlled = source(bytes)
    const archive = await EpubArchive.open(controlled.source)
    const gate = controlled.gateNextRead()

    const reading = archive.readText('chapter.txt')
    await gate.entered
    const closing = archive.close()

    await expect(archive.readText('chapter.txt')).rejects.toThrow('EPUB archive is closed')
    let closed = false
    void closing.then(() => {
      closed = true
    })
    await Promise.resolve()
    expect(closed).toBe(false)

    gate.release()
    await expect(reading).resolves.toBe('accepted read')
    await expect(closing).resolves.toBeUndefined()
    expect(archive.close()).toBe(closing)
    await vi.waitFor(() => expect(closed).toBe(true))
  })

  it('retains failed URL cleanup for a later close attempt without reopening admission', async () => {
    const bytes = await archiveBytes({
      'image.png': 'image bytes',
      'style.css': 'body { background-image: url("image.png"); }',
    })
    const archive = await EpubArchive.open(source(bytes).source)
    const cleanupError = new Error('URL is still in use')
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:epub-image')
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL')
      .mockImplementationOnce(() => {
        throw cleanupError
      })
      .mockImplementationOnce(() => undefined)

    await expect(archive.readResource('style.css', 'text/css')).resolves.toBeInstanceOf(Uint8Array)
    const firstClose = archive.close()
    expect(archive.close()).toBe(firstClose)
    const failure = await firstClose.catch(error => error)
    expect(failure).toBeInstanceOf(AggregateError)
    expect((failure as AggregateError).errors).toEqual([
      expect.objectContaining({
        cause: cleanupError,
        message: 'Failed to close object URLs',
      }),
    ])
    expect(() => archive.links()).toThrow('EPUB archive is closed')
    await expect(archive.readText('style.css')).rejects.toThrow('EPUB archive is closed')

    await expect(archive.close()).resolves.toBeUndefined()
    expect(createObjectUrl).toHaveBeenCalledOnce()
    expect(revokeObjectUrl).toHaveBeenCalledTimes(2)
  })

  it('reports and ranges over rewritten resource bytes instead of the ZIP entry length', async () => {
    const style = 'body { background-image: url("image.png"); }'
    const bytes = await archiveBytes({
      'image.png': 'image bytes',
      'style.css': style,
    })
    const archive = await EpubArchive.open(source(bytes).source)
    const styleLink = new Link({ href: 'style.css', type: 'text/css' })
    archive.registerLinks([
      styleLink,
      new Link({ href: 'image.png', type: 'image/png' }),
    ])
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:rewritten-image')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)

    const resource = archive.get(styleLink)
    const contents = await resource.read()
    if (!contents)
      throw new Error('Expected rewritten EPUB resource bytes')
    expect(new TextDecoder().decode(contents)).toContain('blob:rewritten-image')
    expect(contents.byteLength).not.toBe(new TextEncoder().encode(style).byteLength)
    await expect(resource.length()).resolves.toBe(contents.byteLength)
    await expect(resource.read(new NumberRange(5, 12))).resolves.toEqual(contents.slice(5, 13))

    await archive.close()
  })

  it('revokes object URLs produced by an accepted read before close resolves', async () => {
    const bytes = await archiveBytes({
      'image.png': 'image bytes',
      'style.css': 'body { background-image: url("image.png"); }',
    })
    const controlled = source(bytes)
    const archive = await EpubArchive.open(controlled.source)
    const gate = controlled.gateNextRead()
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:late-image')
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)

    const reading = archive.readResource('style.css', 'text/css')
    await gate.entered
    const closing = archive.close()
    let closed = false
    void closing.then(() => {
      closed = true
    })
    await Promise.resolve()
    expect(closed).toBe(false)

    gate.release()
    await reading
    await closing

    expect(createObjectUrl).toHaveBeenCalledOnce()
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:late-image')
  })
})
