import type { ReaderNormalizedRect } from '../../types'
import type { ReaderClientRect } from '../reader-adapter'
import { normalizedRectWithinSurface } from './geometry'

interface Point {
  x: number
  y: number
}

export interface FixedPageRegionSelectionResult {
  clientRect: ReaderClientRect
  rect: ReaderNormalizedRect
}

interface FixedPageRegionSelectionOptions {
  applyEnabledState: (capture: HTMLElement, enabled: boolean) => void
  createDraft: () => HTMLElement
  onSelection: (selection: FixedPageRegionSelectionResult | null) => void
}

const minimumRegionSize = 6

export class FixedPageRegionSelectionController {
  private capture: HTMLElement | null = null
  private draft: HTMLElement | null = null
  private enabled = false
  private start: Point | null = null
  private surface: HTMLElement | null = null

  private readonly pointerCancelListener = (): void => this.cancel()
  private readonly pointerDownListener = (event: PointerEvent): void => this.begin(event)
  private readonly pointerMoveListener = (event: PointerEvent): void => this.update(event)
  private readonly pointerUpListener = (event: PointerEvent): void => this.finish(event)

  constructor(private readonly options: FixedPageRegionSelectionOptions) {}

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
      throw new Error('Fixed-page region selection is already mounted')
    this.surface = surface
    this.capture = capture
    capture.addEventListener('pointercancel', this.pointerCancelListener)
    capture.addEventListener('pointerdown', this.pointerDownListener)
    capture.addEventListener('pointermove', this.pointerMoveListener)
    capture.addEventListener('pointerup', this.pointerUpListener)
    this.options.applyEnabledState(capture, this.enabled)
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    if (this.capture)
      this.options.applyEnabledState(this.capture, enabled)
    if (!enabled)
      this.cancel()
  }

  private begin(event: PointerEvent): void {
    if (!this.enabled || event.button !== 0)
      return
    const capture = this.capture
    const surface = this.surface
    if (!capture || !surface)
      throw new Error('Fixed-page region selection is not mounted')
    event.preventDefault()
    this.cancel()
    capture.setPointerCapture(event.pointerId)
    const surfaceRect = surface.getBoundingClientRect()
    this.start = this.pointWithinSurface(event, surfaceRect)
    const draft = this.options.createDraft()
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
