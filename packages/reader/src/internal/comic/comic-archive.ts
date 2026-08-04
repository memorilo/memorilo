import type { Entry, FileEntry } from '@zip.js/zip.js'
import type { Extractor, FileHeader } from 'node-unrar-js'
import { BlobReader, BlobWriter, ZipReader } from '@zip.js/zip.js'
import { createExtractorFromData } from 'node-unrar-js'
import unrarWasmUrl from 'node-unrar-js/esm/js/unrar.wasm?url'

export interface ComicPage {
  byteSize: number
  mimeType: string
  name: string
}

export interface ComicArchive {
  close: () => Promise<void>
  pages: readonly ComicPage[]
  readPage: (index: number) => Promise<Blob>
}

const maximumArchiveEntries = 10_000
const maximumComicPages = 5_000
const maximumExpandedBytes = 1024 * 1024 * 1024
const maximumPageBytes = 64 * 1024 * 1024
const imageMediaTypes: Readonly<Record<string, string>> = {
  avif: 'image/avif',
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}
const pageNameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
let unrarWasmPromise: Promise<ArrayBuffer> | null = null

function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

function mediaTypeForPath(path: string): string | null {
  const extension = path.split('.').at(-1)?.toLocaleLowerCase()
  return extension ? imageMediaTypes[extension] ?? null : null
}

function pagePath(path: string): boolean {
  return !path.split('/').some(part => part.startsWith('.') || part === '__MACOSX')
}

function validatePages(pages: readonly ComicPage[]): void {
  if (pages.length === 0)
    throw new Error('The comic archive does not contain any supported images')
  if (pages.length > maximumComicPages)
    throw new Error(`The comic archive contains more than ${maximumComicPages.toLocaleString()} pages`)
  let expandedBytes = 0
  for (const page of pages) {
    if (!Number.isSafeInteger(page.byteSize) || page.byteSize < 0)
      throw new Error(`Comic page ${page.name} has an invalid size`)
    if (page.byteSize > maximumPageBytes)
      throw new Error(`Comic page ${page.name} exceeds the 64 MiB page limit`)
    expandedBytes += page.byteSize
    if (!Number.isSafeInteger(expandedBytes) || expandedBytes > maximumExpandedBytes)
      throw new Error('The expanded comic exceeds the 1 GiB safety limit')
  }
}

function sortedPages(pages: readonly ComicPage[]): ComicPage[] {
  return [...pages].sort((left, right) => pageNameCollator.compare(left.name, right.name))
}

function requirePage(pages: readonly ComicPage[], index: number): ComicPage {
  const page = pages[index]
  if (!page)
    throw new RangeError(`Comic page ${index + 1} is outside the archive`)
  return page
}

async function openCbz(bytes: Uint8Array): Promise<ComicArchive> {
  const reader = new ZipReader(new BlobReader(new Blob([arrayBuffer(bytes)], { type: 'application/vnd.comicbook+zip' })))
  const entriesByName = new Map<string, FileEntry>()
  let pages: readonly ComicPage[]
  try {
    const entries = await reader.getEntries()
    if (entries.length > maximumArchiveEntries)
      throw new Error(`The comic archive contains more than ${maximumArchiveEntries.toLocaleString()} entries`)
    pages = sortedPages(entries.flatMap((entry: Entry): readonly ComicPage[] => {
      if (entry.directory || !pagePath(entry.filename))
        return []
      const mediaType = mediaTypeForPath(entry.filename)
      if (mediaType === null)
        return []
      if (entry.encrypted)
        throw new Error(`Comic page ${entry.filename} is encrypted`)
      entriesByName.set(entry.filename, entry)
      return [{ byteSize: entry.uncompressedSize, mimeType: mediaType, name: entry.filename }]
    }))
    validatePages(pages)
  }
  catch (error) {
    await reader.close()
    throw error
  }
  return {
    close: () => reader.close(),
    pages,
    readPage: async (index) => {
      const page = requirePage(pages, index)
      const entry = entriesByName.get(page.name)
      if (!entry)
        throw new Error(`Comic page ${page.name} disappeared from the archive`)
      const blob = await entry.getData(new BlobWriter(page.mimeType))
      if (blob.size !== page.byteSize || blob.size > maximumPageBytes)
        throw new Error(`Comic page ${page.name} was extracted with an unexpected size`)
      return blob
    },
  }
}

function unrarWasm(): Promise<ArrayBuffer> {
  if (!unrarWasmPromise) {
    unrarWasmPromise = fetch(unrarWasmUrl).then((response) => {
      if (!response.ok)
        throw new Error(`Unable to load the CBR decoder (${response.status})`)
      return response.arrayBuffer()
    })
  }
  return unrarWasmPromise
}

function rarPage(header: FileHeader): ComicPage | null {
  if (header.flags.directory || !pagePath(header.name))
    return null
  const mimeType = mediaTypeForPath(header.name)
  if (mimeType === null)
    return null
  if (header.flags.encrypted)
    throw new Error(`Comic page ${header.name} is encrypted`)
  return { byteSize: header.unpSize, mimeType, name: header.name }
}

async function openCbr(bytes: Uint8Array): Promise<ComicArchive> {
  const extractor = await createExtractorFromData({
    data: arrayBuffer(bytes),
    wasmBinary: await unrarWasm(),
  })
  const fileList = extractor.getFileList()
  if (fileList.arcHeader.flags.volume)
    throw new Error('Multi-volume CBR archives are not supported')
  if (fileList.arcHeader.flags.headerEncrypted)
    throw new Error('Password-protected CBR archives are not supported')
  const headers = [...fileList.fileHeaders]
  if (headers.length > maximumArchiveEntries)
    throw new Error(`The comic archive contains more than ${maximumArchiveEntries.toLocaleString()} entries`)
  const pages = sortedPages(headers.flatMap((header): readonly ComicPage[] => {
    const page = rarPage(header)
    return page ? [page] : []
  }))
  validatePages(pages)
  return {
    close: async () => undefined,
    pages,
    readPage: async index => extractRarPage(extractor, requirePage(pages, index)),
  }
}

function extractRarPage(extractor: Extractor<Uint8Array>, page: ComicPage): Blob {
  const result = extractor.extract({ files: [page.name] })
  const files = [...result.files]
  const extracted = files.find(file => file.fileHeader.name === page.name)?.extraction
  if (!extracted)
    throw new Error(`Unable to extract comic page ${page.name}`)
  if (extracted.byteLength !== page.byteSize)
    throw new Error(`Comic page ${page.name} was extracted with an unexpected size`)
  return new Blob([arrayBuffer(extracted)], { type: page.mimeType })
}

export function openComicArchive(format: 'cbr' | 'cbz', bytes: Uint8Array): Promise<ComicArchive> {
  return format === 'cbz' ? openCbz(bytes) : openCbr(bytes)
}
