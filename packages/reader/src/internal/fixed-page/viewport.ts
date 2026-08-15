import type {
  ReaderPageEdge,
  ReaderScrollDirection,
  ReaderScrollResult,
} from '../reader-adapter'

type EdgePositionTiming = 'immediate' | 'next-frame'

const scrollBoundaryTolerance = 1
const scrollStep = 48

function keyboardScrollBehavior(): ScrollBehavior {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}

export class FixedPageViewportController {
  private edgePositionFrame: number | null = null
  private keyboardScrollTarget: { direction: ReaderScrollDirection, value: number } | null = null
  private readonly wheelListener = (): void => {
    this.keyboardScrollTarget = null
  }

  constructor(private readonly scroller: HTMLElement) {
    scroller.addEventListener('wheel', this.wheelListener, { passive: true })
  }

  destroy(): void {
    this.scroller.removeEventListener('wheel', this.wheelListener)
    if (this.edgePositionFrame !== null)
      cancelAnimationFrame(this.edgePositionFrame)
    this.edgePositionFrame = null
    this.keyboardScrollTarget = null
  }

  move(direction: ReaderScrollDirection): ReaderScrollResult {
    const vertical = direction === 'down' || direction === 'up'
      || direction === 'page-down' || direction === 'page-up'
    const current = vertical ? this.scroller.scrollTop : this.scroller.scrollLeft
    const maximum = vertical
      ? this.scroller.scrollHeight - this.scroller.clientHeight
      : this.scroller.scrollWidth - this.scroller.clientWidth
    const forward = direction === 'down' || direction === 'page-down' || direction === 'right'
    const boundary = forward ? maximum : 0
    if (maximum <= scrollBoundaryTolerance || Math.abs(boundary - current) <= scrollBoundaryTolerance) {
      this.keyboardScrollTarget = null
      return 'at-boundary'
    }

    const amount = direction === 'page-down' || direction === 'page-up'
      ? Math.max(1, this.scroller.clientHeight * 0.9)
      : scrollStep
    const delta = forward ? amount : -amount
    const base = this.keyboardScrollTarget?.direction === direction
      ? this.keyboardScrollTarget.value
      : current
    const next = Math.min(maximum, Math.max(0, base + delta))
    this.keyboardScrollTarget = { direction, value: next }

    if (vertical)
      this.scroller.scrollTo({ behavior: keyboardScrollBehavior(), top: next })
    else
      this.scroller.scrollTo({ behavior: keyboardScrollBehavior(), left: next })
    return 'scrolled'
  }

  positionAtEdge(edge: ReaderPageEdge, timing: EdgePositionTiming = 'immediate'): void {
    this.keyboardScrollTarget = null
    if (this.edgePositionFrame !== null)
      cancelAnimationFrame(this.edgePositionFrame)
    this.edgePositionFrame = null

    if (timing === 'next-frame') {
      this.edgePositionFrame = requestAnimationFrame(() => {
        this.edgePositionFrame = null
        this.scrollToEdge(edge)
      })
      return
    }
    this.scrollToEdge(edge)
  }

  private scrollToEdge(edge: ReaderPageEdge): void {
    this.scroller.scrollTo({
      behavior: 'auto',
      left: edge === 'start' ? 0 : Math.max(0, this.scroller.scrollWidth - this.scroller.clientWidth),
      top: edge === 'start' ? 0 : Math.max(0, this.scroller.scrollHeight - this.scroller.clientHeight),
    })
  }
}
