import type { ShelfPublication, ShelfPublicationLink, ShelfReadingFormat } from './model'
import {
  readingFormatFromFileName,
  readingFormatFromMediaType,
  readingFormatMediaType,
  readingFormats,
} from '@memorilo/reading-model'

export interface ShelfReadingAcquisition {
  format: ShelfReadingFormat
  href: string
  mediaType: string
}

const acquisitionRelation = 'http://opds-spec.org/acquisition'
const secureAcquisitionRelation = 'https://opds-spec.org/acquisition'
function relationValues(value: string): readonly string[] {
  return value.trim().split(/\s+/u).filter(Boolean)
}

function isReadableAcquisition(link: ShelfPublicationLink): boolean {
  return relationValues(link.rel).some(relation => (
    relation === acquisitionRelation
    || relation === secureAcquisitionRelation
    || relation === `${acquisitionRelation}/open-access`
    || relation === `${secureAcquisitionRelation}/open-access`
  ))
}

function formatFromLink(link: ShelfPublicationLink): ShelfReadingFormat | null {
  return readingFormatFromMediaType(link.type)
    ?? readingFormatFromFileName(new URL(link.href).pathname)
}

export function shelfReadingMediaType(format: ShelfReadingFormat): string {
  return readingFormatMediaType(format)
}

export function shelfReadingAcquisitions(publication: ShelfPublication): readonly ShelfReadingAcquisition[] {
  const acquisitions = new Map<ShelfReadingFormat, ShelfReadingAcquisition>()
  for (const link of publication.links) {
    if (!isReadableAcquisition(link))
      continue
    const format = formatFromLink(link)
    if (format === null || acquisitions.has(format))
      continue
    acquisitions.set(format, {
      format,
      href: link.href,
      mediaType: shelfReadingMediaType(format),
    })
  }
  return readingFormats.flatMap((format) => {
    const acquisition = acquisitions.get(format)
    return acquisition ? [acquisition] : []
  })
}
