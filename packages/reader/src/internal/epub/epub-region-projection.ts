import type { EpubNavigator } from '@readium/navigator'
import type {
  ReaderAnnotation,
  ReaderAnnotationColor,
  ReaderEpubRegionAnchor,
  ReaderEpubRegionTarget,
} from '../../types'
import type { ReaderClientRect } from '../reader-adapter'
import type { RegionSelectionResult } from '../region-selection'
import { Locator } from '@readium/shared'
import { normalizedRectWithinSurface } from '../fixed-page/geometry'
import { serializedEpubLocator } from './epub-content-projection'

export interface EpubRegionMarker {
  annotationId: string
  color: ReaderAnnotationColor
  height: number
  left: number
  top: number
  width: number
}

interface EpubRegionSelectionProjection {
  anchor: ReaderEpubRegionAnchor
  clientRect: ReaderClientRect
}

interface VisibleEpubFrame {
  frame: HTMLIFrameElement
  href: string
}

export function projectEpubRegionSelection(
  surface: HTMLElement,
  navigator: EpubNavigator,
  result: RegionSelectionResult,
  locatorForFrame: (href: string) => Locator,
): EpubRegionSelectionProjection {
  const clientRect = new DOMRect(
    result.clientRect.left,
    result.clientRect.top,
    result.clientRect.width,
    result.clientRect.height,
  )
  const visibleFrame = selectedEpubFrame(
    visibleEpubFrames(surface, navigator),
    clientRect,
  )
  return {
    anchor: {
      format: 'epub',
      locator: serializedEpubLocator(locatorForFrame(visibleFrame.href)),
      targets: regionTargetsForFrame(visibleFrame.frame, clientRect),
      type: 'region',
    },
    clientRect: result.clientRect,
  }
}

export function projectEpubRegionMarkers(
  annotations: readonly ReaderAnnotation[],
  surface: HTMLElement,
  navigator: EpubNavigator,
): readonly EpubRegionMarker[] {
  const surfaceRect = surface.getBoundingClientRect()
  const frames = visibleEpubFrames(surface, navigator)
  const markers: EpubRegionMarker[] = []
  for (const annotation of annotations) {
    const anchor = annotation.anchor
    if (anchor.format !== 'epub' || anchor.type !== 'region')
      continue
    const locator = Locator.deserialize(anchor.locator)
    if (!locator)
      throw new Error(`Annotation ${annotation.id} contains an invalid EPUB locator`)
    if (!locatorIsVisible(locator, navigator))
      continue
    const visibleFrame = frames.find(frame => frame.href === locator.href)
    if (!visibleFrame)
      continue
    const frameRect = visibleFrame.frame.getBoundingClientRect()
    for (const target of anchor.targets) {
      const targetRect = markerRectForTarget(target, visibleFrame.frame)
      if (!targetRect)
        continue
      markers.push({
        annotationId: annotation.id,
        color: annotation.color,
        height: targetRect.height * targetRect.frameScaleY,
        left: frameRect.left - surfaceRect.left + targetRect.left * targetRect.frameScaleX,
        top: frameRect.top - surfaceRect.top + targetRect.top * targetRect.frameScaleY,
        width: targetRect.width * targetRect.frameScaleX,
      })
    }
  }
  return markers
}

function locatorIsVisible(locator: Locator, navigator: EpubNavigator): boolean {
  if (!navigator.viewport.readingOrder.includes(locator.href))
    return false
  const progression = locator.locations.progression
  const visibleProgression = navigator.viewport.progressions.get(locator.href)
  if (progression === undefined || visibleProgression === undefined)
    return true
  const tolerance = 0.000_001
  return progression >= visibleProgression.start - tolerance
    && progression <= visibleProgression.end + tolerance
}

function visibleEpubFrames(container: HTMLElement, navigator: EpubNavigator): readonly VisibleEpubFrame[] {
  const containerRect = container.getBoundingClientRect()
  const frames = [...container.querySelectorAll('iframe')].filter((frame) => {
    const rect = frame.getBoundingClientRect()
    const style = getComputedStyle(frame)
    return rect.width > 0
      && rect.height > 0
      && style.display !== 'none'
      && style.visibility !== 'hidden'
      && style.opacity !== '0'
      && intersectionArea(rect, containerRect) > 0
  })
  const readingOrder = navigator.viewport.readingOrder
  const fixedLayout = frames.some(frame => frame.dataset.originalHref !== undefined)
  if (fixedLayout) {
    return frames.flatMap((frame) => {
      const href = frame.dataset.originalHref
      return href && readingOrder.includes(href) ? [{ frame, href }] : []
    })
  }
  if (frames.length !== 1 || readingOrder.length !== 1)
    return []
  return [{ frame: frames[0]!, href: readingOrder[0]! }]
}

function intersectionArea(left: DOMRectReadOnly, right: DOMRectReadOnly): number {
  const width = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left))
  const height = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top))
  return width * height
}

function selectedEpubFrame(
  frames: readonly VisibleEpubFrame[],
  clientRect: DOMRectReadOnly,
): VisibleEpubFrame {
  const matches = frames.filter(frame => intersectionArea(clientRect, frame.frame.getBoundingClientRect()) > 0)
  if (matches.length === 0)
    throw new Error('EPUB area selection does not intersect a loaded publication page')
  if (matches.length > 1)
    throw new Error('EPUB area selection cannot span multiple publication pages')
  return matches[0]!
}

function intersectionRect(left: DOMRectReadOnly, right: DOMRectReadOnly): DOMRect | null {
  const x = Math.max(left.left, right.left)
  const y = Math.max(left.top, right.top)
  const width = Math.max(0, Math.min(left.right, right.right) - x)
  const height = Math.max(0, Math.min(left.bottom, right.bottom) - y)
  return width > 0 && height > 0 ? new DOMRect(x, y, width, height) : null
}

function stableSelector(element: Element): string {
  const document = element.ownerDocument
  if (element.id) {
    const byId = `#${CSS.escape(element.id)}`
    if (document.querySelectorAll(byId).length === 1)
      return byId
  }

  const segments: string[] = []
  let current: Element | null = element
  while (current) {
    const name = CSS.escape(current.localName)
    const siblings = current.parentElement
      ? [...current.parentElement.children].filter(sibling => sibling.localName === current!.localName)
      : [current]
    segments.unshift(`${name}:nth-of-type(${siblings.indexOf(current) + 1})`)
    current = current.parentElement
  }
  const selector = segments.join(' > ')
  if (document.querySelectorAll(selector).length !== 1)
    throw new Error('Unable to create a stable selector for EPUB area selection')
  return selector
}

function isMediaAnchor(element: Element): boolean {
  return ['canvas', 'img', 'picture', 'svg', 'video'].includes(element.localName)
}

function hasDirectText(element: Element): boolean {
  return [...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())
}

function regionTargetsForFrame(frame: HTMLIFrameElement, clientRect: DOMRectReadOnly): ReaderEpubRegionTarget[] {
  const frameRect = frame.getBoundingClientRect()
  const frameWindow = frame.contentWindow
  const frameDocument = frame.contentDocument
  if (!frameWindow || !frameDocument?.body)
    throw new Error('EPUB area selection frame is not ready')
  const clipped = intersectionRect(clientRect, frameRect)
  if (!clipped)
    throw new Error('EPUB area selection does not intersect its publication page')
  const scaleX = frameWindow.innerWidth / frameRect.width
  const scaleY = frameWindow.innerHeight / frameRect.height
  const contentRect = new DOMRect(
    (clipped.left - frameRect.left) * scaleX,
    (clipped.top - frameRect.top) * scaleY,
    clipped.width * scaleX,
    clipped.height * scaleY,
  )
  const candidates = [...frameDocument.body.querySelectorAll('*')].filter((element) => {
    if (!isMediaAnchor(element) && !hasDirectText(element))
      return false
    const rect = element.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0 && intersectionArea(rect, contentRect) > 0
  })
  const mediaCandidates = candidates.filter(isMediaAnchor)
  const preferred = mediaCandidates.length > 0 ? mediaCandidates : candidates
  const outermost = preferred.length > 0
    ? preferred.filter(element => !preferred.some(other => other !== element && other.contains(element)))
    : frame.dataset.originalHref !== undefined
      ? [frameDocument.body]
      : []
  if (outermost.length === 0)
    throw new Error('EPUB area selection does not intersect anchorable content')
  return outermost.map((element) => {
    const elementRect = element.getBoundingClientRect()
    const overlap = intersectionRect(contentRect, elementRect)
    const rect = overlap && normalizedRectWithinSurface(overlap, elementRect)
    if (!rect)
      throw new Error('EPUB area selection produced an invalid content rectangle')
    return { rect, selector: stableSelector(element) }
  })
}

function markerRectForTarget(
  target: ReaderEpubRegionTarget,
  frame: HTMLIFrameElement,
): { frameScaleX: number, frameScaleY: number, height: number, left: number, top: number, width: number } | null {
  const frameWindow = frame.contentWindow
  const frameDocument = frame.contentDocument
  if (!frameWindow || !frameDocument)
    return null
  const element = frameDocument.querySelector(target.selector)
  if (!element)
    return null
  const elementRect = element.getBoundingClientRect()
  const frameRect = frame.getBoundingClientRect()
  if (elementRect.width <= 0 || elementRect.height <= 0 || frameWindow.innerWidth <= 0 || frameWindow.innerHeight <= 0)
    return null
  return {
    frameScaleX: frameRect.width / frameWindow.innerWidth,
    frameScaleY: frameRect.height / frameWindow.innerHeight,
    left: elementRect.left + target.rect.x * elementRect.width,
    top: elementRect.top + target.rect.y * elementRect.height,
    width: target.rect.width * elementRect.width,
    height: target.rect.height * elementRect.height,
  }
}
