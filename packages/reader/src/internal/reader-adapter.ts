import type { OperationSupervisor } from '@memorilo/effect-lifecycle'
import type {
  ReaderAnnotation,
  ReaderCapabilities,
  ReaderClientRect,
  ReaderFormat,
  ReaderLocation,
  ReaderOcrStatus,
  ReaderOutlineItem,
  ReaderPosition,
  ReaderPresentationMode,
  ReaderScaleCapability,
  ReaderSelection,
  ReaderTextLayerKind,
  ReaderTextQuote,
} from '../types'

export type { ReaderClientRect } from '../types'

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

export function assertReaderPositionFormat<Format extends ReaderPosition['format']>(
  position: ReaderPosition,
  format: Format,
  readerLabel: string,
): asserts position is Extract<ReaderPosition, { format: Format }> {
  if (position.format !== format)
    throw new TypeError(`Cannot restore ${position.format} position in ${readerLabel}`)
}

export function boundingReaderClientRect(rects: readonly DOMRectReadOnly[]): ReaderClientRect {
  const left = Math.min(...rects.map(rect => rect.left))
  const top = Math.min(...rects.map(rect => rect.top))
  const right = Math.max(...rects.map(rect => rect.right))
  const bottom = Math.max(...rects.map(rect => rect.bottom))
  return { height: bottom - top, left, top, width: right - left }
}

export function clampReaderScale(value: number): number {
  return Math.min(readerMaximumScale, Math.max(readerMinimumScale, Math.round(value * 10) / 10))
}

export function readerTextQuote(range: Range, root: Node, exact: string): ReaderTextQuote {
  const document = root.ownerDocument
  if (!document)
    return { exact }
  const beforeRange = document.createRange()
  beforeRange.selectNodeContents(root)
  beforeRange.setEnd(range.startContainer, range.startOffset)
  const afterRange = document.createRange()
  afterRange.selectNodeContents(root)
  afterRange.setStart(range.endContainer, range.endOffset)
  return {
    after: afterRange.toString().slice(0, 64),
    before: beforeRange.toString().slice(-64),
    exact,
  }
}

export function toReaderError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

export async function runSingleMount(
  operations: Pick<OperationSupervisor, 'runSingleFlight'>,
  operation: (signal: AbortSignal) => Promise<void>,
  alreadyMounted: () => Error,
): Promise<void> {
  const result = await operations.runSingleFlight(operation)
  if (result.status === 'busy')
    throw alreadyMounted()
}

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
  mount: (container: HTMLElement, signal?: AbortSignal) => Promise<void>
  moveViewport: (direction: ReaderScrollDirection) => ReaderScrollResult
  recognizeCurrentPage?: () => Promise<void>
  setAnnotations: (annotations: readonly ReaderAnnotation[]) => void
  setRegionSelectionEnabled?: (enabled: boolean) => void
  setScale?: (scale: number) => Promise<void>
}
