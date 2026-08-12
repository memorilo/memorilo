import { cp, mkdir, mkdtemp, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createShelfReadingId, ShelfReadingFileStore } from './shelf-reading-file-store'

function encodeText(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

function readingId(seed: string): string {
  return createShelfReadingId('source-1', seed, 'txt')
}

describe('shelf reading file store', () => {
  let root: string
  let store: ShelfReadingFileStore

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'memorilo-shelf-store-'))
    store = await ShelfReadingFileStore.open({
      cacheDirectory: join(root, 'cache'),
      libraryDirectory: join(root, 'library'),
      maximumCacheBytes: 64 * 1024,
    })
  })

  afterEach(async () => {
    await store.close()
    await rm(root, { force: true, recursive: true })
  })

  function saveInput(readingId: string, name: string, content: string) {
    return {
      book: { authors: ['Author'], title: name },
      bytes: encodeText(content),
      format: 'txt' as const,
      name,
      publicationId: 'publication-1',
      readingId,
      retention: 'cache' as const,
      sourceId: 'source-1',
    }
  }

  it('saves, finds, and reports a cache location', async () => {
    const saved = await store.save(saveInput(readingId('a'), 'Book.txt', 'hello'))
    expect(saved.location).toBe('cache')
    expect(saved.document.name).toBe('Book.txt')
    expect(await store.find(readingId('a'))).toEqual(saved)
    const bytes = await store.readRange({ readingId: readingId('a'), offset: 0, length: 5 })
    expect(encodeText('hello')).toEqual(bytes)
  })

  it('serializes concurrent saves of the same reading into one consistent document', async () => {
    const slowInput = (async () => {
      await new Promise(resolve => setTimeout(resolve, 20))
      return saveInput(readingId('same'), 'Book.txt', 'first-batch')
    })()
    const fastInput = saveInput(readingId('same'), 'Book.txt', 'fast-batch')

    await Promise.all([
      slowInput.then(input => store.save(input)),
      store.save(fastInput),
    ])

    const file = await store.find(readingId('same'))
    expect(file).not.toBeNull()
    const leftovers = (await readdir(join(root, 'cache', readingId('same')))).filter(name => /\.part$/u.test(name))
    expect(leftovers).toEqual([])
  })

  it('promotes a cached reading to the library and deletes the cache copy', async () => {
    await store.save(saveInput(readingId('p'), 'Promoted.txt', 'content'))
    expect((await store.find(readingId('p')))?.location).toBe('cache')

    expect((await store.retainInLibrary(readingId('p')))?.location).toBe('library')
    expect((await store.find(readingId('p')))?.location).toBe('library')

    const bytes = await store.readRange({ readingId: readingId('p'), offset: 0, length: 7 })
    expect(encodeText('content')).toEqual(bytes)
  })

  it('recovers cache cleanup left behind after a library commit', async () => {
    const id = readingId('partial-promotion')
    const input = saveInput(id, 'Recovered.txt', 'content')
    const cachePath = join(root, 'cache', id)
    const libraryPath = join(root, 'library', id)
    await store.save(input)
    await store.retainInLibrary(id)

    await cp(libraryPath, cachePath, { recursive: true })
    await expect(store.retainInLibrary(id)).resolves.toMatchObject({ location: 'library' })
    await expect(readdir(join(root, 'cache'))).resolves.not.toContain(id)

    await cp(libraryPath, cachePath, { recursive: true })
    await expect(store.save({ ...input, retention: 'library' }))
      .resolves
      .toMatchObject({ location: 'library' })
    await expect(readdir(join(root, 'cache'))).resolves.not.toContain(id)
  })

  it('recovers interrupted directory transactions on the next startup', async () => {
    const rolledBackId = readingId('rollback')
    const committedId = readingId('committed')
    await store.save(saveInput(rolledBackId, 'Rollback.txt', 'old content'))
    await store.save(saveInput(committedId, 'Committed.txt', 'new content'))
    const cacheRoot = join(root, 'cache')
    await rename(
      join(cacheRoot, rolledBackId),
      join(cacheRoot, `${rolledBackId}.backup`),
    )
    await cp(
      join(cacheRoot, committedId),
      join(cacheRoot, `${committedId}.backup`),
      { recursive: true },
    )
    await mkdir(join(cacheRoot, `${readingId('temporary')}.staged.part`))
    await store.close()

    store = await ShelfReadingFileStore.open({
      cacheDirectory: cacheRoot,
      libraryDirectory: join(root, 'library'),
      maximumCacheBytes: 64 * 1024,
    })

    expect((await store.find(rolledBackId))?.location).toBe('cache')
    expect((await store.find(committedId))?.location).toBe('cache')
    expect(await readdir(cacheRoot)).toEqual(expect.arrayContaining([rolledBackId, committedId]))
    expect((await readdir(cacheRoot)).some(name => name.endsWith('.backup') || name.endsWith('.part'))).toBe(false)
  })

  it('releases the write lock after a failed operation so later writes still run', async () => {
    const missing = readingId('missing')
    await expect(store.readRange({ readingId: missing, offset: 0, length: 4 })).rejects.toThrow()

    await store.save(saveInput(readingId('q'), 'Book.txt', 'restored'))
    const file = await store.find(readingId('q'))
    expect(file).not.toBeNull()
    const bytes = await store.readRange({ readingId: readingId('q'), offset: 0, length: 8 })
    expect(encodeText('restored')).toEqual(bytes)
  })

  it('rejects every operation after close', async () => {
    const id = readingId('closed')
    await store.close()

    await expect(store.find(id)).rejects.toThrow('Shelf reading file store is closed')
    await expect(store.readRange({ length: 0, offset: 0, readingId: id }))
      .rejects
      .toThrow('Shelf reading file store is closed')
    await expect(store.retainInLibrary(id)).rejects.toThrow('Shelf reading file store is closed')
    await expect(store.deleteFromLibrary(id)).rejects.toThrow('Shelf reading file store is closed')
    await expect(store.save(saveInput(id, 'Closed.txt', 'content')))
      .rejects
      .toThrow('Shelf reading file store is closed')
  })

  it('drains an accepted range read and shares concurrent close calls', async () => {
    const id = readingId('drain')
    await store.save(saveInput(id, 'Drain.txt', 'accepted'))

    const read = store.readRange({ length: 8, offset: 0, readingId: id })
    const closing = store.close()

    expect(store.close()).toBe(closing)
    await expect(read).resolves.toEqual(encodeText('accepted'))
    await expect(closing).resolves.toBeUndefined()
  })

  it('releases the file handle when range validation fails', async () => {
    const id = readingId('range-failure')
    await store.save({
      ...saveInput(id, 'Library.txt', 'content'),
      retention: 'library',
    })

    await expect(store.readRange({ length: 8, offset: 0, readingId: id }))
      .rejects
      .toThrow('exceeds the 7-byte publication')
    await expect(store.deleteFromLibrary(id)).resolves.toBe(true)
  })

  it('rejects same-length content changes against the manifest hash', async () => {
    const id = readingId('content-integrity')
    await store.save({
      ...saveInput(id, 'Integrity.txt', 'original'),
      retention: 'library',
    })

    await writeFile(join(root, 'library', id, 'Integrity.txt'), encodeText('modified'))

    await expect(store.find(id)).rejects.toThrow(
      'Shelf reading file content does not match its manifest',
    )
    await expect(store.readRange({ length: 7, offset: 0, readingId: id })).rejects.toThrow(
      'Shelf reading file content does not match its manifest',
    )
  })

  it('removes an invalid cached document while opening the store', async () => {
    const id = readingId('invalid-cache')
    const runtimeId = readingId('runtime-invalid-cache')
    const cacheRoot = join(root, 'cache')
    await store.close()
    await mkdir(join(cacheRoot, id))
    await writeFile(join(cacheRoot, id, 'manifest.json'), '{not-json', 'utf8')

    store = await ShelfReadingFileStore.open({
      cacheDirectory: cacheRoot,
      libraryDirectory: join(root, 'library'),
      maximumCacheBytes: 64 * 1024,
    })

    await expect(store.find(id)).resolves.toBeNull()
    await expect(readdir(cacheRoot)).resolves.not.toContain(id)

    await mkdir(join(cacheRoot, runtimeId))
    await writeFile(join(cacheRoot, runtimeId, 'manifest.json'), '{still-not-json', 'utf8')
    await expect(store.find(runtimeId)).resolves.toBeNull()
    await expect(readdir(cacheRoot)).resolves.not.toContain(runtimeId)
  })

  it('rejects overlapping cache and library roots', async () => {
    await expect(ShelfReadingFileStore.open({
      cacheDirectory: join(root, 'overlap'),
      libraryDirectory: join(root, 'overlap', 'library'),
    })).rejects.toThrow('must not overlap')
  })
})
