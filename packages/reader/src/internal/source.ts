import type { ReaderFormat, ReaderSource, ReaderSourceData } from '../types'

const pdfSignature = [0x25, 0x50, 0x44, 0x46, 0x2D] as const
const zipSignature = [0x50, 0x4B] as const
const rar4Signature = [0x52, 0x61, 0x72, 0x21, 0x1A, 0x07, 0x00] as const
const rar5Signature = [0x52, 0x61, 0x72, 0x21, 0x1A, 0x07, 0x01, 0x00] as const

const defaultNames: Readonly<Record<ReaderFormat, string>> = {
  cbr: 'CBR comic',
  cbz: 'CBZ comic',
  epub: 'EPUB publication',
  pdf: 'PDF document',
  txt: 'Text document',
}

export async function readSourceBytes(data: ReaderSourceData): Promise<Uint8Array> {
  if (data instanceof Uint8Array)
    return data.slice()
  if (data instanceof ArrayBuffer)
    return new Uint8Array(data.slice(0))
  return new Uint8Array(await data.arrayBuffer())
}

export async function resolveSource(source: ReaderSource): Promise<{
  bytes: Uint8Array
  format: ReaderFormat
  name: string
}> {
  const bytes = await readSourceBytes(source.data)
  if (bytes.byteLength === 0)
    throw new Error('The selected document is empty')

  const format = source.format ?? sniffFormat(bytes, source.name)
  return {
    bytes,
    format,
    name: source.name?.trim() || defaultNames[format],
  }
}

function sniffFormat(bytes: Uint8Array, name?: string): ReaderFormat {
  const extension = name?.split('.').pop()?.toLowerCase()
  if (pdfSignature.every((value, index) => bytes[index] === value))
    return 'pdf'
  if (rar4Signature.every((value, index) => bytes[index] === value)
    || rar5Signature.every((value, index) => bytes[index] === value)) {
    return 'cbr'
  }
  if (zipSignature.every((value, index) => bytes[index] === value)) {
    if (extension === 'cbz')
      return 'cbz'
    return 'epub'
  }

  if (extension === 'pdf' || extension === 'epub' || extension === 'cbz' || extension === 'cbr' || extension === 'txt')
    return extension

  throw new Error('Unsupported document. Select a PDF, EPUB, TXT, CBZ, or CBR file')
}
