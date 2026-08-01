import type {
  ReaderAnnotation,
  ReaderCapabilities,
  ReaderFormat,
  ReaderLocation,
  ReaderOcrStatus,
  ReaderPresentationMode,
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

export interface ReaderAdapterState {
  canGoBackward: boolean
  canGoForward: boolean
  capabilities: ReaderCapabilities
  format: ReaderFormat
  location: ReaderLocation
  presentationMode: ReaderPresentationMode
  presentationModeReason?: string
  scale: number
  textLayer?: ReaderTextLayerKind
  title: string
}

export interface ReaderAdapterCallbacks {
  onAnnotationActivate: (activation: ReaderAdapterAnnotationActivation) => void
  onError: (error: Error) => void
  onOcrStatusChange: (status: ReaderOcrStatus) => void
  onSelectionChange: (selection: ReaderAdapterSelection | null) => void
  onStateChange: (state: ReaderAdapterState) => void
}

export interface ReaderAdapter {
  clearSelection: () => void
  destroy: () => Promise<void>
  goBackward: () => Promise<void>
  goForward: () => Promise<void>
  goToAnnotation: (annotationId: string) => Promise<void>
  mount: (container: HTMLElement) => Promise<void>
  recognizeCurrentPage: () => Promise<void>
  setAnnotations: (annotations: readonly ReaderAnnotation[]) => void
  setPresentationMode: (mode: ReaderPresentationMode) => Promise<void>
  setRegionSelectionEnabled: (enabled: boolean) => void
  setScale: (scale: number) => Promise<void>
}
