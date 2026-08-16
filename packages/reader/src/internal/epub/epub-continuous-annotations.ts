import type { ReaderAnnotation } from '../../types'
import type { ContinuousEpubSection } from './epub-continuous-section'
import { annotationOverlayTint } from '../annotations'
import {
  epubContinuousTextOffsets,
  epubContinuousTextRange,
} from './epub-continuous-text-selection'
import { normalizeEpubPath } from './epub-resource-content'

function annotationMarker(
  annotation: ReaderAnnotation,
  section: ContinuousEpubSection,
  rect: DOMRectReadOnly,
  label: string,
): HTMLButtonElement {
  const marker = section.root.ownerDocument.createElement('button')
  marker.className = 'memorilo-epub-annotation'
  marker.dataset.annotationId = annotation.id
  marker.setAttribute('aria-label', label)
  marker.type = 'button'
  const sectionRect = section.root.getBoundingClientRect()
  const tint = annotationOverlayTint(annotation.color)
  Object.assign(marker.style, {
    background: annotation.style === 'highlight' ? tint : 'transparent',
    borderBottom: annotation.style === 'underline' ? `2px solid ${tint}` : '0',
    height: `${rect.height}px`,
    left: `${rect.left - sectionRect.left}px`,
    top: `${rect.top - sectionRect.top}px`,
    width: `${rect.width}px`,
  })
  return marker
}

export function renderContinuousEpubAnnotations(
  annotations: readonly ReaderAnnotation[],
  sections: readonly ContinuousEpubSection[],
  label: string,
): void {
  for (const section of sections)
    section.annotationLayer.replaceChildren()
  for (const annotation of annotations) {
    for (const anchor of annotation.anchors) {
      if (anchor.format !== 'epub')
        continue
      const section = sections.find(candidate => candidate.href === normalizeEpubPath(anchor.locator.href))
      if (!section)
        continue
      if (anchor.type === 'text') {
        const offsets = epubContinuousTextOffsets(anchor, section.content)
        const range = epubContinuousTextRange(section.content, offsets.start, offsets.end)
        for (const rect of [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0))
          section.annotationLayer.append(annotationMarker(annotation, section, rect, label))
        continue
      }
      for (const target of anchor.targets) {
        const element = section.content.querySelector(target.selector)
        if (!element)
          continue
        const elementRect = element.getBoundingClientRect()
        const rect = new DOMRect(
          elementRect.left + target.rect.x * elementRect.width,
          elementRect.top + target.rect.y * elementRect.height,
          target.rect.width * elementRect.width,
          target.rect.height * elementRect.height,
        )
        section.annotationLayer.append(annotationMarker(annotation, section, rect, label))
      }
    }
  }
}
