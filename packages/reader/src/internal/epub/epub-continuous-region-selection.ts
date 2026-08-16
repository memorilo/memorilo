import type { ReaderEpubRegionTarget } from '../../types'
import type { ReaderClientRect } from '../reader-adapter'
import type { RegionSelectionResult } from '../region-selection'
import type { ContinuousEpubSection } from './epub-continuous-section'
import { normalizedRectWithinSurface } from '../fixed-page/geometry'

export interface ContinuousEpubRegionSelection {
  clientRect: ReaderClientRect
  progression: number
  section: ContinuousEpubSection
  targets: readonly ReaderEpubRegionTarget[]
}

function intersectionRect(left: DOMRectReadOnly, right: DOMRectReadOnly): DOMRect | null {
  const x = Math.max(left.left, right.left)
  const y = Math.max(left.top, right.top)
  const width = Math.max(0, Math.min(left.right, right.right) - x)
  const height = Math.max(0, Math.min(left.bottom, right.bottom) - y)
  return width > 0 && height > 0 ? new DOMRect(x, y, width, height) : null
}

function isAnchorableElement(element: Element): boolean {
  if (['canvas', 'img', 'picture', 'svg', 'video'].includes(element.localName))
    return true
  return [...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())
}

function stableSelector(root: HTMLElement, element: Element): string {
  if (!root.contains(element))
    throw new Error('EPUB region target is outside its spine section')
  if (element.id) {
    const byId = `#${CSS.escape(element.id)}`
    if (root.querySelectorAll(byId).length === 1)
      return byId
  }
  const segments: string[] = []
  let current: Element | null = element
  while (current && current !== root) {
    const name = CSS.escape(current.localName)
    const siblings = current.parentElement
      ? [...current.parentElement.children].filter(sibling => sibling.localName === current!.localName)
      : [current]
    segments.unshift(`${name}:nth-of-type(${siblings.indexOf(current) + 1})`)
    current = current.parentElement
  }
  if (current !== root || segments.length === 0)
    throw new Error('Unable to create an EPUB region target selector')
  const selector = segments.join(' > ')
  if (root.querySelectorAll(selector).length !== 1)
    throw new Error('Unable to create a stable EPUB region target selector')
  return selector
}

export function projectContinuousEpubRegionSelection(
  result: RegionSelectionResult,
  frameRect: DOMRectReadOnly,
  sections: readonly ContinuousEpubSection[],
): ContinuousEpubRegionSelection {
  const localRect = new DOMRect(
    result.clientRect.left - frameRect.left,
    result.clientRect.top - frameRect.top,
    result.clientRect.width,
    result.clientRect.height,
  )
  const section = sections.find(candidate => intersectionRect(localRect, candidate.root.getBoundingClientRect()))
  if (!section)
    throw new Error('EPUB area selection does not intersect a spine section')
  const candidates = [...section.content.querySelectorAll('*')].filter((element) => {
    if (!isAnchorableElement(element))
      return false
    return intersectionRect(localRect, element.getBoundingClientRect()) !== null
  })
  const media = candidates.filter(element => ['canvas', 'img', 'picture', 'svg', 'video'].includes(element.localName))
  const preferred = media.length > 0 ? media : candidates
  const targets: ReaderEpubRegionTarget[] = preferred
    .filter(element => !preferred.some(other => other !== element && other.contains(element)))
    .map((element) => {
      const elementRect = element.getBoundingClientRect()
      const overlap = intersectionRect(localRect, elementRect)
      const rect = overlap && normalizedRectWithinSurface(overlap, elementRect)
      if (!rect)
        throw new Error('EPUB area selection produced an invalid content rectangle')
      return { rect, selector: stableSelector(section.content, element) }
    })
  if (targets.length === 0)
    throw new Error('EPUB area selection does not intersect anchorable content')
  const sectionRect = section.root.getBoundingClientRect()
  const progression = sectionRect.height <= 0
    ? 0
    : Math.min(1, Math.max(0, (localRect.top - sectionRect.top) / sectionRect.height))
  return { clientRect: result.clientRect, progression, section, targets }
}
