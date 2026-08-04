import type { ReaderAnnotation } from '../types'

export function readerAnnotationLabel(annotation: ReaderAnnotation): string {
  const anchor = annotation.anchor
  if (anchor.format === 'pdf')
    return anchor.type === 'region' ? `Area on page ${anchor.pageNumber}` : `Page ${anchor.pageNumber}`
  if (anchor.format === 'epub')
    return anchor.locator.title || anchor.locator.href
  if (anchor.format === 'txt')
    return `Text near character ${anchor.start.toLocaleString()}`
  return `Area on page ${anchor.pageNumber}`
}
