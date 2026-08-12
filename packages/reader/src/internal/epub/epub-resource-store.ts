import type { Link } from '@readium/shared'
import type { Entry, FileEntry } from '@zip.js/zip.js'
import {
  createOperationSupervisor,
  createResourceScope,
  runLifecycleOperations,
} from '@memorilo/effect-lifecycle'
import { Uint8ArrayWriter } from '@zip.js/zip.js'
import {
  epubMediaTypeForPath,
  normalizeEpubPath,
  requiresEpubContentRewrite,
  rewriteEpubResource,
} from './epub-resource-content'

const maximumEntryCount = 20_000
const maximumEntrySize = 128 * 1024 * 1024
const maximumExpandedSize = 512 * 1024 * 1024
const textDecoder = new TextDecoder()

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

export class EpubResourceStore {
  private readonly entries = new Map<string, FileEntry>()
  private readonly linksByPath = new Map<string, Link>()
  private readonly objectUrlPromises = new Map<string, Promise<string>>()
  private readonly objectUrls = new Set<string>()
  private readonly operations = createOperationSupervisor('EPUB resources', {
    closedError: () => new Error('EPUB resources are closed'),
    concurrency: 'unbounded',
  })

  private readonly resources = createResourceScope('EPUB resources')
  private readonly rewrittenBytes = new Map<string, Promise<Uint8Array>>()

  constructor(entries: readonly Entry[]) {
    this.indexEntries(entries)
    this.resources.own({
      close: () => this.operations.close(),
      name: 'resource operations',
    })
    this.resources.own({
      close: async () => {
        this.objectUrlPromises.clear()
        this.rewrittenBytes.clear()
        await runLifecycleOperations(
          [...this.objectUrls].map(url => () => {
            URL.revokeObjectURL(url)
            this.objectUrls.delete(url)
          }),
          'Failed to revoke EPUB object URLs',
        )
      },
      name: 'object URLs',
    })
    this.resources.commit()
  }

  byteLength(path: string, declaredMediaType?: string): Promise<number> {
    return this.operations.run(() => this.resourceByteLength(path, declaredMediaType))
  }

  close(): Promise<void> {
    return this.resources.close()
  }

  has(path: string): boolean {
    this.ensureOpen()
    return this.entries.has(normalizeEpubPath(path))
  }

  links(): Link[] {
    this.ensureOpen()
    return [...this.linksByPath.values()]
  }

  read(path: string, declaredMediaType?: string): Promise<Uint8Array> {
    return this.operations.run(() => this.readResource(path, declaredMediaType))
  }

  readText(path: string): Promise<string> {
    return this.operations.run(async () => textDecoder.decode(await this.readEntry(path)))
  }

  registerLinks(links: readonly Link[]): void {
    this.ensureOpen()
    for (const link of links)
      this.linksByPath.set(normalizeEpubPath(link.href), link)
  }

  private cachedRewrite(path: string, rewrite: () => Promise<Uint8Array>): Promise<Uint8Array> {
    const existing = this.rewrittenBytes.get(path)
    if (existing)
      return existing
    const pending = rewrite()
    this.rewrittenBytes.set(path, pending)
    void pending.then(
      () => undefined,
      () => {
        if (this.rewrittenBytes.get(path) === pending)
          this.rewrittenBytes.delete(path)
      },
    )
    return pending
  }

  private ensureOpen(): void {
    if (this.resources.isClosed())
      throw new Error('EPUB resources are closed')
  }

  private indexEntries(entries: readonly Entry[]): void {
    if (entries.length > maximumEntryCount)
      throw new Error(`EPUB contains too many files (${entries.length})`)
    let expandedSize = 0
    for (const entry of entries) {
      if (entry.directory)
        continue
      if (entry.encrypted)
        throw new Error('Encrypted or DRM-protected EPUB files are not supported')
      if (entry.uncompressedSize > maximumEntrySize)
        throw new Error(`EPUB resource is too large: ${entry.filename}`)
      expandedSize += entry.uncompressedSize
      if (expandedSize > maximumExpandedSize)
        throw new Error('EPUB expands beyond the supported size limit')
      const path = normalizeEpubPath(entry.filename)
      if (this.entries.has(path))
        throw new Error(`EPUB contains a duplicate resource: ${path}`)
      this.entries.set(path, entry)
    }
  }

  private async objectUrl(path: string, stack: ReadonlySet<string> = new Set()): Promise<string> {
    const normalized = normalizeEpubPath(path)
    if (stack.has(normalized))
      return 'about:blank'
    const existing = this.objectUrlPromises.get(normalized)
    if (existing)
      return existing

    const nextStack = new Set(stack)
    nextStack.add(normalized)
    const pending = (async () => {
      const mediaType = this.linksByPath.get(normalized)?.type || epubMediaTypeForPath(normalized)
      const bytes = await this.rewrite(normalized, mediaType, nextStack)
      const url = URL.createObjectURL(new Blob([asArrayBuffer(bytes)], { type: mediaType }))
      this.objectUrls.add(url)
      return url
    })()
    this.objectUrlPromises.set(normalized, pending)
    void pending.then(
      () => undefined,
      () => {
        if (this.objectUrlPromises.get(normalized) === pending)
          this.objectUrlPromises.delete(normalized)
      },
    )
    return pending
  }

  private readEntry(path: string): Promise<Uint8Array> {
    return this.requireEntry(path).getData(new Uint8ArrayWriter())
  }

  private readResource(path: string, declaredMediaType?: string): Promise<Uint8Array> {
    const normalized = normalizeEpubPath(path)
    const mediaType = declaredMediaType || epubMediaTypeForPath(normalized)
    if (requiresEpubContentRewrite(mediaType))
      return this.cachedRewrite(normalized, () => this.rewrite(normalized, mediaType))
    return this.readEntry(normalized)
  }

  private requireEntry(path: string): FileEntry {
    const normalized = normalizeEpubPath(path)
    const entry = this.entries.get(normalized)
    if (!entry)
      throw new Error(`EPUB resource not found: ${normalized}`)
    return entry
  }

  private async resourceByteLength(path: string, declaredMediaType?: string): Promise<number> {
    const normalized = normalizeEpubPath(path)
    const mediaType = declaredMediaType || epubMediaTypeForPath(normalized)
    if (requiresEpubContentRewrite(mediaType))
      return (await this.readResource(normalized, mediaType)).byteLength
    return this.requireEntry(normalized).uncompressedSize
  }

  private rewrite(
    path: string,
    mediaType: string,
    stack: ReadonlySet<string> = new Set(),
  ): Promise<Uint8Array> {
    return rewriteEpubResource({
      hasResource: candidate => this.entries.has(candidate),
      mediaType,
      objectUrl: (candidate, nextStack) => this.objectUrl(candidate, nextStack),
      path,
      readResource: candidate => this.readEntry(candidate),
      stack,
    })
  }
}
