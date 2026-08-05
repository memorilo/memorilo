export const readingFormats = ['epub', 'pdf', 'txt', 'cbz', 'cbr'] as const

export type ReadingFormat = typeof readingFormats[number]

export interface ReadingFormatDefinition {
  readonly defaultName: string
  readonly displayName: string
  readonly extensions: readonly string[]
  readonly mediaType: string
  readonly mediaTypes: readonly string[]
}

export const readingFormatDefinitions: Readonly<Record<ReadingFormat, ReadingFormatDefinition>> = {
  cbr: {
    defaultName: 'CBR comic',
    displayName: 'CBR',
    extensions: ['cbr'],
    mediaType: 'application/vnd.comicbook-rar',
    mediaTypes: [
      'application/vnd.comicbook-rar',
      'application/x-cbr',
      'application/vnd.rar',
      'application/x-rar-compressed',
    ],
  },
  cbz: {
    defaultName: 'CBZ comic',
    displayName: 'CBZ',
    extensions: ['cbz'],
    mediaType: 'application/vnd.comicbook+zip',
    mediaTypes: ['application/vnd.comicbook+zip', 'application/x-cbz'],
  },
  epub: {
    defaultName: 'EPUB publication',
    displayName: 'EPUB',
    extensions: ['epub'],
    mediaType: 'application/epub+zip',
    mediaTypes: ['application/epub+zip'],
  },
  pdf: {
    defaultName: 'PDF document',
    displayName: 'PDF',
    extensions: ['pdf'],
    mediaType: 'application/pdf',
    mediaTypes: ['application/pdf'],
  },
  txt: {
    defaultName: 'Text document',
    displayName: 'TXT',
    extensions: ['txt'],
    mediaType: 'text/plain',
    mediaTypes: ['text/plain'],
  },
}

const formatSet: ReadonlySet<string> = new Set(readingFormats)

const formatByExtension = new Map<string, ReadingFormat>(
  readingFormats.flatMap(format => (
    readingFormatDefinitions[format].extensions.map(extension => [extension, format] as const)
  )),
)

const formatByMediaType = new Map<string, ReadingFormat>(
  readingFormats.flatMap(format => (
    readingFormatDefinitions[format].mediaTypes.map(mediaType => [mediaType, format] as const)
  )),
)

const pdfSignature = [0x25, 0x50, 0x44, 0x46, 0x2D] as const
const rar4Signature = [0x52, 0x61, 0x72, 0x21, 0x1A, 0x07, 0x00] as const
const rar5Signature = [0x52, 0x61, 0x72, 0x21, 0x1A, 0x07, 0x01, 0x00] as const
const zipSignatures = [
  [0x50, 0x4B, 0x03, 0x04],
  [0x50, 0x4B, 0x05, 0x06],
  [0x50, 0x4B, 0x07, 0x08],
] as const

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte)
}

function hasZipSignature(bytes: Uint8Array): boolean {
  return zipSignatures.some(signature => startsWith(bytes, signature))
}

export function isReadingFormat(value: unknown): value is ReadingFormat {
  return typeof value === 'string' && formatSet.has(value)
}

export function assertReadingFormat(value: unknown): asserts value is ReadingFormat {
  if (!isReadingFormat(value))
    throw new TypeError(`Unsupported reading format: ${String(value)}`)
}

export function readingFormatDefinition(format: ReadingFormat): ReadingFormatDefinition {
  return readingFormatDefinitions[format]
}

export function readingFormatDefaultName(format: ReadingFormat): string {
  return readingFormatDefinition(format).defaultName
}

export function readingFormatDisplayName(format: ReadingFormat): string {
  return readingFormatDefinition(format).displayName
}

export function readingFormatExtension(format: ReadingFormat): string {
  const [extension] = readingFormatDefinition(format).extensions
  if (extension === undefined)
    throw new Error(`Reading format ${format} has no file extension`)
  return extension
}

export function readingFormatMediaType(format: ReadingFormat): string {
  return readingFormatDefinition(format).mediaType
}

export function readingFormatFromExtension(value: string): ReadingFormat | null {
  const extension = value.trim().replace(/^\./u, '').toLowerCase()
  return formatByExtension.get(extension) ?? null
}

export function readingFormatFromFileName(fileName: string): ReadingFormat | null {
  const extensionIndex = fileName.lastIndexOf('.')
  if (extensionIndex < 0)
    return null
  return readingFormatFromExtension(fileName.slice(extensionIndex + 1))
}

export function readingFormatFromMediaType(value: string | null | undefined): ReadingFormat | null {
  if (value === null || value === undefined)
    return null
  const mediaType = value.split(';', 1)[0]?.trim().toLowerCase()
  return mediaType ? formatByMediaType.get(mediaType) ?? null : null
}

export function hasReadingFormatSignature(bytes: Uint8Array, format: ReadingFormat): boolean {
  if (bytes.byteLength === 0)
    return false
  if (format === 'txt')
    return true
  if (format === 'pdf')
    return startsWith(bytes, pdfSignature)
  if (format === 'epub' || format === 'cbz')
    return hasZipSignature(bytes)
  return startsWith(bytes, rar4Signature) || startsWith(bytes, rar5Signature)
}

export function detectReadingFormat(bytes: Uint8Array, fileName?: string): ReadingFormat | null {
  const extensionFormat = fileName === undefined ? null : readingFormatFromFileName(fileName)
  if (hasReadingFormatSignature(bytes, 'pdf'))
    return 'pdf'
  if (hasReadingFormatSignature(bytes, 'cbr'))
    return 'cbr'
  if (hasReadingFormatSignature(bytes, 'epub'))
    return extensionFormat === 'cbz' ? 'cbz' : 'epub'
  return extensionFormat
}

export function createReadingFileAccept(
  formats: readonly ReadingFormat[] = readingFormats,
): string {
  const tokens = formats.flatMap((format) => {
    const definition = readingFormatDefinition(format)
    return [
      ...definition.extensions.map(extension => `.${extension}`),
      ...definition.mediaTypes,
    ]
  })
  return [...new Set(tokens)].join(',')
}

export const readingFileAccept = createReadingFileAccept()
