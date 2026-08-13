import type {
  ReaderAnnotation,
  ReaderTxtRegionAnchor,
  ReaderTxtTextAnchor,
} from '../../types'

type TxtTextAnnotation = ReaderAnnotation & { anchor: ReaderTxtTextAnchor }

export interface TxtAnnotationRun {
  annotation: TxtTextAnnotation | null
  end: number
  start: number
  text: string
}

export interface TxtDocument {
  readonly length: number
  readonly text: string
  annotationRuns: (annotations: readonly ReaderAnnotation[]) => readonly TxtAnnotationRun[]
  requireRegionRange: (annotation: ReaderAnnotation & { anchor: ReaderTxtRegionAnchor }) => { end: number, start: number }
  textAnchor: (start: number, end: number) => ReaderTxtTextAnchor
}

function decodeText(bytes: Uint8Array): string {
  let encoding = 'utf-8'
  let offset = 0
  if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    offset = 3
  }
  else if (bytes[0] === 0xFF && bytes[1] === 0xFE) {
    encoding = 'utf-16le'
    offset = 2
  }
  else if (bytes[0] === 0xFE && bytes[1] === 0xFF) {
    encoding = 'utf-16be'
    offset = 2
  }
  else if (bytes.byteLength >= 4) {
    const sampleLength = Math.min(bytes.byteLength, 512)
    let evenZeros = 0
    let oddZeros = 0
    for (let index = 0; index < sampleLength; index += 1) {
      if (bytes[index] === 0)
        index % 2 === 0 ? evenZeros += 1 : oddZeros += 1
    }
    if (oddZeros > sampleLength / 8 && evenZeros === 0)
      encoding = 'utf-16le'
    else if (evenZeros > sampleLength / 8 && oddZeros === 0)
      encoding = 'utf-16be'
  }

  try {
    return new TextDecoder(encoding, { fatal: true })
      .decode(bytes.subarray(offset))
      .replaceAll('\r\n', '\n')
      .replaceAll('\r', '\n')
  }
  catch (error) {
    throw new Error('This TXT file is not valid UTF-8 or UTF-16 text', { cause: error })
  }
}

function validRange(length: number, start: number, end: number): boolean {
  return Number.isSafeInteger(start)
    && Number.isSafeInteger(end)
    && start >= 0
    && end <= length
    && start < end
}

function requireRange(length: number, start: number, end: number, message: string): void {
  if (!validRange(length, start, end))
    throw new RangeError(message)
}

export function decodeTxtDocument(bytes: Uint8Array): TxtDocument {
  const text = decodeText(bytes)
  const length = text.length

  const annotationRuns = (annotations: readonly ReaderAnnotation[]): readonly TxtAnnotationRun[] => {
    const textAnnotations = annotations.filter((annotation): annotation is TxtTextAnnotation => (
      annotation.anchor.format === 'txt'
      && annotation.anchor.type === 'text'
      && validRange(length, annotation.anchor.start, annotation.anchor.end)
    ))
    const boundaries = [...new Set([
      0,
      length,
      ...textAnnotations.flatMap(annotation => [annotation.anchor.start, annotation.anchor.end]),
    ])].sort((left, right) => left - right)

    const runs: TxtAnnotationRun[] = []
    for (let index = 0; index < boundaries.length - 1; index += 1) {
      const start = boundaries[index]
      const end = boundaries[index + 1]
      if (start === undefined || end === undefined || end <= start)
        continue
      const annotation = textAnnotations
        .filter(candidate => candidate.anchor.start <= start && candidate.anchor.end >= end)
        .sort((left, right) => right.updatedAt - left.updatedAt)[0] ?? null
      runs.push({ annotation, end, start, text: text.slice(start, end) })
    }
    return runs
  }

  const requireRegionRange = (
    annotation: ReaderAnnotation & { anchor: ReaderTxtRegionAnchor },
  ): { end: number, start: number } => {
    const { end, start } = annotation.anchor
    requireRange(length, start, end, `Annotation ${annotation.id} contains invalid TXT region offsets`)
    return { end, start }
  }

  const textAnchor = (start: number, end: number): ReaderTxtTextAnchor => {
    requireRange(length, start, end, `TXT text range ${start}..${end} is outside the document`)
    return {
      end,
      format: 'txt',
      quote: {
        after: text.slice(end, end + 64),
        before: text.slice(Math.max(0, start - 64), start),
        exact: text.slice(start, end),
      },
      start,
      type: 'text',
    }
  }

  return { annotationRuns, length, requireRegionRange, text, textAnchor }
}
