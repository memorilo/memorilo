import type { TFunction } from 'i18next'
import type { ReaderAnnotation } from '../types'

export function readerAnnotationLabel(annotation: ReaderAnnotation, t: TFunction<'common'>): string {
  const anchor = annotation.anchor
  if (anchor.format === 'pdf') {
    return anchor.type === 'region'
      ? t('reader.annotation.areaOnPage', { page: anchor.pageNumber })
      : t('reader.annotation.page', { page: anchor.pageNumber })
  }
  if (anchor.format === 'epub') {
    return anchor.type === 'region'
      ? t('reader.annotation.areaInSection', { section: anchor.locator.title || anchor.locator.href })
      : anchor.locator.title || anchor.locator.href
  }
  if (anchor.format === 'txt') {
    return t(
      anchor.type === 'region' ? 'reader.annotation.areaNearCharacter' : 'reader.annotation.textNearCharacter',
      { position: anchor.start.toLocaleString() },
    )
  }
  return t('reader.annotation.areaOnPage', { page: anchor.pageNumber })
}
