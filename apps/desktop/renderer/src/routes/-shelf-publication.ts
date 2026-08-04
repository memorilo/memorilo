import type { ShelfPublicationDetails } from '@memorilo/shelf'

export function shelfPublicationQueryKey(sourceId: string, publicationId: string) {
  return ['shelf-publication', sourceId, publicationId] as const
}

export function cacheShelfPublication(
  publication: ShelfPublicationDetails['publication'],
  source: ShelfPublicationDetails['source'],
): ShelfPublicationDetails {
  return { publication, readingOptions: [], source }
}

export function shelfFormatName(type: string | null): string {
  if (type === 'application/epub+zip')
    return 'EPUB'
  if (type === 'application/pdf')
    return 'PDF'
  if (type === 'text/plain')
    return 'TXT'
  if (type === 'application/vnd.comicbook+zip' || type === 'application/x-cbz')
    return 'CBZ'
  if (type === 'application/vnd.comicbook-rar'
    || type === 'application/x-cbr'
    || type === 'application/vnd.rar'
    || type === 'application/x-rar-compressed') {
    return 'CBR'
  }
  if (type === null)
    return 'Book'
  return type.split('/').at(-1)?.toLocaleUpperCase() ?? type.toLocaleUpperCase()
}
