import type { Fetcher, Link, NumberRange } from '@readium/shared'
import type { ResolvedReaderSource } from '../source'
import {
  combineLifecycleFailures,
  createResourceScope,
} from '@memorilo/effect-lifecycle'
import { Resource } from '@readium/shared'
import { ZipReader } from '@zip.js/zip.js'
import { ReaderSourceZipReader } from '../zip-reader'
import { normalizeEpubPath } from './epub-resource-content'
import { EpubResourceStore } from './epub-resource-store'

class EpubResource extends Resource {
  constructor(
    private readonly archive: EpubArchive,
    private readonly resourceLink: Link,
    private readonly path: string,
  ) {
    super()
  }

  async link(): Promise<Link> {
    return this.resourceLink
  }

  async length(): Promise<number> {
    return this.archive.resourceLength(this.path, this.resourceLink.type)
  }

  async read(range?: NumberRange): Promise<Uint8Array> {
    const bytes = await this.archive.readResource(this.path, this.resourceLink.type)
    if (!range)
      return bytes.slice()
    return bytes.slice(range.start, range.endInclusive + 1)
  }

  close(): void {}
}

export class EpubArchive implements Fetcher {
  private readonly resources = createResourceScope('EPUB archive')

  private constructor(
    private readonly zipReader: ZipReader<ResolvedReaderSource>,
    private readonly resourceStore: EpubResourceStore,
  ) {
    this.resources.own({
      close: () => this.resourceStore.close(),
      name: 'resource store',
    })
    this.resources.own({
      close: () => this.zipReader.close(),
      name: 'ZIP reader',
    })
    this.resources.commit()
  }

  static async open(source: ResolvedReaderSource, signal?: AbortSignal): Promise<EpubArchive> {
    signal?.throwIfAborted()
    const zipReader = new ZipReader(new ReaderSourceZipReader(source, signal))
    try {
      const entries = await zipReader.getEntries()
      signal?.throwIfAborted()
      const resources = new EpubResourceStore(entries)
      return new EpubArchive(zipReader, resources)
    }
    catch (error) {
      try {
        await zipReader.close()
      }
      catch (cleanupError) {
        throw combineLifecycleFailures(
          [error, cleanupError],
          'Failed to open and close EPUB archive',
        )
      }
      throw error
    }
  }

  registerLinks(links: readonly Link[]): void {
    this.ensureOpen()
    this.resourceStore.registerLinks(links)
  }

  links(): Link[] {
    this.ensureOpen()
    return this.resourceStore.links()
  }

  get(link: Link): Resource {
    this.ensureOpen()
    const path = normalizeEpubPath(link.href)
    if (!this.resourceStore.has(path))
      throw new Error(`EPUB resource not found: ${link.href}`)
    return new EpubResource(this, link, path)
  }

  readText(path: string): Promise<string> {
    return this.runRead(() => this.resourceStore.readText(path))
  }

  readResource(path: string, declaredMediaType?: string): Promise<Uint8Array> {
    return this.runRead(() => this.resourceStore.read(path, declaredMediaType))
  }

  resourceLength(path: string, declaredMediaType?: string): Promise<number> {
    return this.runRead(() => this.resourceStore.byteLength(path, declaredMediaType))
  }

  close(): Promise<void> {
    return this.resources.close()
  }

  private ensureOpen(): void {
    if (this.resources.isClosed())
      throw new Error('EPUB archive is closed')
  }

  private runRead<Result>(read: () => Promise<Result>): Promise<Result> {
    try {
      this.ensureOpen()
      return read()
    }
    catch (error) {
      return Promise.reject(error)
    }
  }
}
