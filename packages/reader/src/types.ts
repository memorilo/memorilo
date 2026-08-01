export type ReaderFormat = 'epub' | 'pdf'

export type ReaderPresentationMode = 'publisher' | 'reader'

export type ReaderAnnotationColor = 'blue' | 'green' | 'pink' | 'purple' | 'yellow'

export type ReaderTextLayerKind = 'embedded' | 'none' | 'ocr' | 'recognizing'

export type ReaderSourceData = ArrayBuffer | Blob | Uint8Array

export interface ReaderSource {
  data: ReaderSourceData
  format?: ReaderFormat
  name?: string
}

export interface ReaderLocation {
  format: ReaderFormat
  href?: string
  label: string
  position?: number
  progression: number
  total?: number
}

/** A rectangle normalized to the rendered page, with every value between 0 and 1. */
export interface ReaderNormalizedRect {
  height: number
  width: number
  x: number
  y: number
}

export interface ReaderTextQuote {
  after?: string
  before?: string
  exact: string
}

export interface ReaderPdfTextAnchor {
  format: 'pdf'
  pageNumber: number
  quote: ReaderTextQuote
  rects: readonly ReaderNormalizedRect[]
  source: 'embedded' | 'ocr'
  type: 'text'
}

export interface ReaderPdfRegionAnchor {
  format: 'pdf'
  pageNumber: number
  rect: ReaderNormalizedRect
  type: 'region'
}

/** A serializable Readium locator. It intentionally contains no Readium class instances. */
export interface ReaderEpubLocator {
  href: string
  locations?: Record<string, unknown>
  text?: Record<string, unknown>
  title?: string
  type: string
}

export interface ReaderEpubTextAnchor {
  format: 'epub'
  locator: ReaderEpubLocator
  quote: ReaderTextQuote
  type: 'text'
}

export type ReaderTextAnchor = ReaderEpubTextAnchor | ReaderPdfTextAnchor
export type ReaderAnchor = ReaderPdfRegionAnchor | ReaderTextAnchor

export interface ReaderTextSelection {
  anchor: ReaderTextAnchor
  text: string
  type: 'text'
}

export interface ReaderRegionSelection {
  anchor: ReaderPdfRegionAnchor
  type: 'region'
}

export type ReaderSelection = ReaderRegionSelection | ReaderTextSelection

interface ReaderAnnotationBase {
  anchor: ReaderAnchor
  color: ReaderAnnotationColor
  createdAt: number
  id: string
  updatedAt: number
}

export interface ReaderHighlight extends ReaderAnnotationBase {
  kind: 'highlight'
}

export interface ReaderNote extends ReaderAnnotationBase {
  body: string
  kind: 'annotation'
}

export type ReaderAnnotation = ReaderHighlight | ReaderNote

export interface ReaderOcrTextItem {
  confidence?: number
  rect: ReaderNormalizedRect
  text: string
}

export interface ReaderOcrRequest {
  format: 'pdf'
  image: Blob
  pageNumber: number
  pixelHeight: number
  pixelWidth: number
  renderedHeight: number
  renderedWidth: number
  signal: AbortSignal
}

export interface ReaderOcrResult {
  items: readonly ReaderOcrTextItem[]
}

export type ReaderOcrProvider = (request: ReaderOcrRequest) => Promise<ReaderOcrResult>

export interface ReaderOcrStatus {
  error?: Error
  pageNumber: number
  state: 'failed' | 'idle' | 'recognizing' | 'ready' | 'unavailable'
}

export interface ReaderCapabilities {
  annotations?: boolean
  ocr?: boolean
  presentationModes: readonly ReaderPresentationMode[]
  regionSelection?: boolean
  scale: boolean
  textSelection?: boolean
}

export interface ReaderProps {
  annotations?: readonly ReaderAnnotation[]
  ariaLabel?: string
  defaultAnnotations?: readonly ReaderAnnotation[]
  initialPresentationMode?: ReaderPresentationMode
  ocrProvider?: ReaderOcrProvider
  onAnnotationsChange?: (annotations: readonly ReaderAnnotation[]) => void
  onError?: (error: Error) => void
  onLocationChange?: (location: ReaderLocation) => void
  onOcrStatusChange?: (status: ReaderOcrStatus) => void
  onSelectionChange?: (selection: ReaderSelection | null) => void
  source: ReaderSource
}
