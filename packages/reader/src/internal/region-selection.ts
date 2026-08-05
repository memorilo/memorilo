import type { ReaderNormalizedRect } from '../types'
import type { ReaderClientRect } from './reader-adapter'
import { normalizedRectWithinSurface } from './fixed-page/geometry'
import { regionSelectionClassNames } from './region-selection.stylex'

interface Point {
  x: number
  y: number
}

export interface RegionSelectionResult {
  clientRect: ReaderClientRect
  rect: ReaderNormalizedRect
}

interface RegionSelectionOptions {
  onEnabledChange: (enabled: boolean) => void
  onSelection: (selection: RegionSelectionResult | null) => void
}

const minimumRegionSize = 6

export class RegionSelectionController {
  private capture: HTMLElement | null = null
  private draft: HTMLElement | null = null
  private enabled = false
  private start: Point | null = null
  private surface: HTMLElement | null = null

  private readonly pointerCancelListener = (): void => this.cancel()
  private readonly pointerDownListener = (event: PointerEvent): void => this.begin(event)
  private readonly pointerMoveListener = (event: PointerEvent): void => this.update(event)
  private readonly pointerUpListener = (event: PointerEvent): void => this.finish(event)

  constructor(private readonly options: RegionSelectionOptions) {}

  destroy(): void {
    this.cancel()
    const capture = this.capture
    if (capture) {
      capture.removeEventListener('pointercancel', this.pointerCancelListener)
      capture.removeEventListener('pointerdown', this.pointerDownListener)
      capture.removeEventListener('pointermove', this.pointerMoveListener)
      capture.removeEventListener('pointerup', this.pointerUpListener)
    }
    this.capture = null
    this.surface = null
  }

  mount(surface: HTMLElement, capture: HTMLElement): void {
    if (this.surface || this.capture)
      throw new Error('Region selection is already mounted')
    this.surface = surface
    this.capture = capture
    capture.addEventListener('pointercancel', this.pointerCancelListener)
    capture.addEventListener('pointerdown', this.pointerDownListener)
    capture.addEventListener('pointermove', this.pointerMoveListener)
    capture.addEventListener('pointerup', this.pointerUpListener)
    this.applyEnabledState()
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled)
      return
    this.enabled = enabled
    this.applyEnabledState()
    if (!enabled)
      this.cancel()
    this.options.onEnabledChange(enabled)
  }

  private applyEnabledState(): void {
    if (this.capture) {
      this.capture.className = this.enabled
        ? regionSelectionClassNames.captureActive
        : regionSelectionClassNames.capture
    }
  }

  private begin(event: PointerEvent): void {
    if (!this.enabled || event.button !== 0)
      return
    const capture = this.capture
    const surface = this.surface
    if (!capture || !surface)
      throw new Error('Region selection is not mounted')
    event.preventDefault()
    this.cancel()
    capture.setPointerCapture(event.pointerId)
    const surfaceRect = surface.getBoundingClientRect()
    this.start = this.pointWithinSurface(event, surfaceRect)
    const draft = document.createElement('div')
    draft.className = regionSelectionClassNames.draft
    capture.append(draft)
    this.draft = draft
    this.positionDraft(this.start)
  }

  private cancel(): void {
    this.draft?.remove()
    this.draft = null
    this.start = null
  }

  private finish(event: PointerEvent): void {
    const draft = this.draft
    const surface = this.surface
    if (!this.start || !draft || !surface)
      return
    this.update(event)
    const draftRect = draft.getBoundingClientRect()
    const rect = normalizedRectWithinSurface(draftRect, surface.getBoundingClientRect())
    if (!rect || draftRect.width < minimumRegionSize || draftRect.height < minimumRegionSize) {
      this.cancel()
      this.options.onSelection(null)
      return
    }
    this.setEnabled(false)
    this.options.onSelection({
      clientRect: {
        height: draftRect.height,
        left: draftRect.left,
        top: draftRect.top,
        width: draftRect.width,
      },
      rect,
    })
  }

  private pointWithinSurface(event: PointerEvent, surfaceRect: DOMRectReadOnly): Point {
    return {
      x: Math.min(surfaceRect.width, Math.max(0, event.clientX - surfaceRect.left)),
      y: Math.min(surfaceRect.height, Math.max(0, event.clientY - surfaceRect.top)),
    }
  }

  private positionDraft(point: Point): void {
    const draft = this.draft
    const start = this.start
    if (!draft || !start)
      return
    draft.style.height = `${Math.abs(point.y - start.y)}px`
    draft.style.left = `${Math.min(start.x, point.x)}px`
    draft.style.top = `${Math.min(start.y, point.y)}px`
    draft.style.width = `${Math.abs(point.x - start.x)}px`
  }

  private update(event: PointerEvent): void {
    const surface = this.surface
    if (!this.start || !surface)
      return
    this.positionDraft(this.pointWithinSurface(event, surface.getBoundingClientRect()))
  }
}
