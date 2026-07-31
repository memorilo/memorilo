import type { ReaderFormat, ReaderSource, ReaderSourceData } from '../types'

const pdfSignature = [0x25, 0x50, 0x44, 0x46, 0x2D] as const
const zipSignature = [0x50, 0x4B] as const

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
    name: source.name?.trim() || (format === 'pdf' ? 'PDF document' : 'EPUB publication'),
  }
}

function sniffFormat(bytes: Uint8Array, name?: string): ReaderFormat {
  if (pdfSignature.every((value, index) => bytes[index] === value))
    return 'pdf'
  if (zipSignature.every((value, index) => bytes[index] === value))
    return 'epub'

  const extension = name?.split('.').pop()?.toLowerCase()
  if (extension === 'pdf' || extension === 'epub')
    return extension

  throw new Error('Unsupported document. Select a PDF or EPUB file')
}
