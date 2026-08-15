import type {
  ReadingAnchor,
  ReadingAnnotation,
  ReadingAnnotationColor,
  ReadingAnnotationStyle,
  ReadingComicRegionAnchor,
  ReadingEpubLocator,
  ReadingEpubRegionAnchor,
  ReadingEpubRegionTarget,
  ReadingEpubTextAnchor,
  ReadingFormat,
  ReadingHighlight,
  ReadingNormalizedRect,
  ReadingNote,
  ReadingPdfRegionAnchor,
  ReadingPdfTextAnchor,
  ReadingPosition,
  ReadingRegionAnchor,
  ReadingTextAnchor,
  ReadingTextQuote,
  ReadingTxtRegionAnchor,
  ReadingTxtTextAnchor,
} from '@memorilo/reading-model'
import type { ReactNode } from 'react'

export interface ReaderAuxiliarySidebarController {
  active: boolean
  toggle: () => void
}

export interface ReaderAuxiliarySidebar {
  content: ReactNode
  icon: ReactNode
  label: string
}

export type ReaderFormat = ReadingFormat

export type ReaderPresentationMode = 'publisher' | 'reader'

export type ReaderAnnotationColor = ReadingAnnotationColor
export type ReaderAnnotationStyle = ReadingAnnotationStyle
export type ReaderAnnotationCopyFormat = 'text' | 'text-book' | 'text-book-location'

export type ReaderTextLayerKind = 'embedded' | 'none' | 'ocr'

export type ReaderSourceData = ArrayBuffer | Blob | Uint8Array

interface ReaderSourceMetadata {
  format?: ReaderFormat
  name?: string
}

export interface ReaderDataSource extends ReaderSourceMetadata {
  data: ReaderSourceData
  byteLength?: never
  read?: never
}

export interface ReaderRandomAccessSource extends ReaderSourceMetadata {
  byteLength: number
  data?: never
  read: (offset: number, length: number, signal?: AbortSignal) => Promise<Uint8Array>
}

export type ReaderSource = ReaderDataSource | ReaderRandomAccessSource

export interface ReaderLocation {
  format: ReaderFormat
  href?: string
  label: string
  position?: number
  progression: number
  total?: number
}

export interface ReaderClientRect {
  height: number
  left: number
  top: number
  width: number
}

interface ReaderImageOcclusionShapeBase {
  groupId: string
  id: string
}

export interface ReaderImageOcclusionBoundsShape extends ReaderImageOcclusionShapeBase {
  height: number
  kind: 'ellipse' | 'rectangle'
  width: number
  x: number
  y: number
}

export interface ReaderImageOcclusionBrushShape extends ReaderImageOcclusionShapeBase {
  kind: 'brush'
  points: readonly number[]
  strokeWidth: number
}

export type ReaderImageOcclusionShape
  = | ReaderImageOcclusionBoundsShape
    | ReaderImageOcclusionBrushShape

export interface ReaderImageOcclusionOverlay {
  annotationId: string
  image: {
    height: number
    width: number
  }
  shapes: readonly ReaderImageOcclusionShape[]
}

export interface ReaderOutlineItem {
  children: readonly ReaderOutlineItem[]
  href?: string
  id: string
  label: string
  navigable: boolean
}

export type ReaderNormalizedRect = ReadingNormalizedRect
export type ReaderTextQuote = ReadingTextQuote
export type ReaderPdfTextAnchor = ReadingPdfTextAnchor
export type ReaderPdfRegionAnchor = ReadingPdfRegionAnchor
export type ReaderEpubLocator = ReadingEpubLocator
export type ReaderEpubTextAnchor = ReadingEpubTextAnchor
export type ReaderEpubRegionTarget = ReadingEpubRegionTarget
export type ReaderEpubRegionAnchor = ReadingEpubRegionAnchor
export type ReaderTxtTextAnchor = ReadingTxtTextAnchor
export type ReaderTxtRegionAnchor = ReadingTxtRegionAnchor
export type ReaderComicRegionAnchor = ReadingComicRegionAnchor
export type ReaderTextAnchor = ReadingTextAnchor
export type ReaderRegionAnchor = ReadingRegionAnchor
export type ReaderAnchor = ReadingAnchor
export type ReaderPosition = ReadingPosition

export interface ReaderTextSelection {
  anchor: ReaderTextAnchor
  text: string
  type: 'text'
}

export interface ReaderRegionSelection {
  anchor: ReaderRegionAnchor
  type: 'region'
}

export type ReaderSelection = ReaderRegionSelection | ReaderTextSelection

export type ReaderHighlight = ReadingHighlight
export type ReaderNote = ReadingNote
export type ReaderAnnotation = ReadingAnnotation

export interface ReaderAnnotationEditorRenderInput {
  annotation: ReaderAnnotation
  readOnly: boolean
}

export interface ReaderAnnotationTopicCreateInput {
  annotation: ReaderAnnotation
  clientRect: ReaderClientRect
  location: string
}

export interface ReaderAnnotationDependents {
  annotationTopicId?: string
  imageOcclusionTopicIds: readonly string[]
}

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

export type ReaderScaleKind = 'font-size' | 'zoom'

export interface ReaderScaleCapability {
  readonly kind: ReaderScaleKind
  readonly maximum: number
  readonly minimum: number
  readonly step: number
}

export interface ReaderCapabilities {
  annotations?: boolean
  ocr?: boolean
  regionSelection?: boolean
  scale?: ReaderScaleCapability
  textSelection?: boolean
}

export interface ReaderProps {
  annotationCopyBookTitle?: string
  annotationCopyFormat?: ReaderAnnotationCopyFormat
  annotationEditingEnabled?: boolean
  arrowKeyPageTurning?: boolean
  annotations?: readonly ReaderAnnotation[]
  ariaLabel?: string
  auxiliarySidebar?: ReaderAuxiliarySidebar
  defaultAnnotations?: readonly ReaderAnnotation[]
  initialPosition?: ReaderPosition | null
  initialPresentationMode?: ReaderPresentationMode
  initialAnnotationId?: string
  imageOcclusionOverlays?: readonly ReaderImageOcclusionOverlay[]
  ocrProvider?: ReaderOcrProvider
  onAnnotationsChange?: (annotations: readonly ReaderAnnotation[]) => void
  onCreateAnnotationTopic?: (input: ReaderAnnotationTopicCreateInput, signal: AbortSignal) => Promise<string>
  onPrepareAnnotationDeletion?: (annotation: ReaderAnnotation) => Promise<void>
  onDetachAnnotationTopic?: (topicId: string) => Promise<void>
  onError?: (error: Error) => void
  onLocationChange?: (location: ReaderLocation) => void
  onOcrStatusChange?: (status: ReaderOcrStatus) => void
  onGetAnnotationDependents?: (annotation: ReaderAnnotation) => ReaderAnnotationDependents
  onOpenReaderRegionImageOcclusion?: (
    input: ReaderAnnotationTopicCreateInput,
    signal: AbortSignal,
  ) => Promise<void>
  onPositionChange?: (position: ReaderPosition) => void
  onSelectionChange?: (selection: ReaderSelection | null) => void
  renderAnnotationEditor?: (input: ReaderAnnotationEditorRenderInput) => ReactNode
  sidebarActions?: ReactNode | ((controller: ReaderAuxiliarySidebarController) => ReactNode)
  title?: string
  toolbarActions?: ReactNode
  source: ReaderSource
}
