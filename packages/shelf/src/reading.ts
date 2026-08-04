import type { ShelfPublication, ShelfPublicationLink, ShelfReadingFormat } from './model'

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

function normalizedMediaType(value: string | null): string | null {
  if (value === null)
    return null
  const mediaType = value.split(';', 1)[0]?.trim().toLocaleLowerCase()
  return mediaType && mediaType.length > 0 ? mediaType : null
}

function formatFromLink(link: ShelfPublicationLink): ShelfReadingFormat | null {
  const mediaType = normalizedMediaType(link.type)
  if (mediaType === 'application/epub+zip')
    return 'epub'
  if (mediaType === 'application/pdf')
    return 'pdf'

  const pathname = new URL(link.href).pathname.toLocaleLowerCase()
  if (pathname.endsWith('.epub'))
    return 'epub'
  if (pathname.endsWith('.pdf'))
    return 'pdf'
  return null
}

export function shelfReadingMediaType(format: ShelfReadingFormat): string {
  return format === 'epub' ? 'application/epub+zip' : 'application/pdf'
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
  return (['epub', 'pdf'] as const).flatMap((format) => {
    const acquisition = acquisitions.get(format)
    return acquisition ? [acquisition] : []
  })
}
