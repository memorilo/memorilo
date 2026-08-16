import type { ShelfPublicationDetails } from '@memorilo/shelf'

export {
  desktopEffect,
  desktopEffectQuery as shelfEffectQuery,
} from '../../shared/effect-query'

export function shelfErrorMessage(error: Error | null): string | null {
  if (error === null)
    return null
  const line = error.message.split('\n').find(value => value.trim().length > 0)
  return line?.replace(/^Error:\s*/u, '') ?? 'Shelf operation failed.'
}

export function shelfPublicationQueryKey(sourceId: string, publicationId: string) {
  return ['shelf-publication', sourceId, publicationId] as const
}

export function cacheShelfPublication(
  publication: ShelfPublicationDetails['publication'],
  source: ShelfPublicationDetails['source'],
): ShelfPublicationDetails {
  return { publication, readingOptions: [], source }
}
