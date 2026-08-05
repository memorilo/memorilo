import type {
  ReaderAnnotation,
  ReaderCapabilities,
  ReaderFormat,
  ReaderLocation,
  ReaderOcrStatus,
  ReaderOutlineItem,
  ReaderPosition,
  ReaderPresentationMode,
  ReaderScaleCapability,
  ReaderSelection,
  ReaderTextLayerKind,
} from '../types'

export interface ReaderClientRect {
  height: number
  left: number
  top: number
  width: number
}

export interface ReaderAdapterSelection {
  clientRect: ReaderClientRect
  selection: ReaderSelection
}

export interface ReaderAdapterAnnotationActivation {
  annotationId: string
}

export type ReaderScrollDirection = 'down' | 'left' | 'right' | 'up'
export type ReaderScrollResult = 'at-boundary' | 'scrolled'
export type ReaderPageEdge = 'end' | 'start'

export interface ReaderAdapterKeyboardEvent {
  altKey: boolean
  ctrlKey: boolean
  key: string
  metaKey: boolean
  repeat: boolean
  shiftKey: boolean
}

export const readerMinimumScale = 0.4
export const readerMaximumScale = 2
export const readerScaleStep = 0.1
export const readerFontSizeScaleCapability: ReaderScaleCapability = {
  kind: 'font-size',
  maximum: readerMaximumScale,
  minimum: readerMinimumScale,
  step: readerScaleStep,
}
export const readerZoomScaleCapability: ReaderScaleCapability = {
  kind: 'zoom',
  maximum: readerMaximumScale,
  minimum: readerMinimumScale,
  step: readerScaleStep,
}

export interface ReaderAdapterState {
  canGoBackward: boolean
  canGoForward: boolean
  capabilities: ReaderCapabilities
  format: ReaderFormat
  location: ReaderLocation
  outline: readonly ReaderOutlineItem[]
  position: ReaderPosition
  presentationMode: ReaderPresentationMode
  presentationModeReason?: string
  scale: number
  textLayer?: ReaderTextLayerKind
  title: string
}

export interface ReaderAdapterCallbacks {
  onAnnotationActivate: (activation: ReaderAdapterAnnotationActivation) => void
  onError: (error: Error) => void
  onKeyDown: (event: ReaderAdapterKeyboardEvent) => boolean
  onOcrStatusChange: (status: ReaderOcrStatus) => void
  onRegionSelectionModeChange: (enabled: boolean) => void
  onSelectionChange: (selection: ReaderAdapterSelection | null) => void
  onStateChange: (state: ReaderAdapterState) => void
  regionAnnotationLabel: () => string
}

export interface ReaderAdapter {
  clearSelection: () => void
  destroy: () => Promise<void>
  goBackward: (entryEdge: ReaderPageEdge) => Promise<void>
  goForward: (entryEdge: ReaderPageEdge) => Promise<void>
  goToAnnotation: (annotationId: string) => Promise<void>
  goToOutlineItem?: (outlineItemId: string) => Promise<void>
  mount: (container: HTMLElement) => Promise<void>
  moveViewport: (direction: ReaderScrollDirection) => ReaderScrollResult
  recognizeCurrentPage?: () => Promise<void>
  setAnnotations: (annotations: readonly ReaderAnnotation[]) => void
  setRegionSelectionEnabled?: (enabled: boolean) => void
  setScale?: (scale: number) => Promise<void>
}
