import type { ShelfPublication, ShelfSource } from '@memorilo/shelf'
import type { RefObject } from 'react'
import * as stylex from '@stylexjs/stylex'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { AlertCircle, BookOpen, LoaderCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useShelfCover } from '../shelf-cover'
import { cacheShelfPublication, shelfPublicationQueryKey } from '../shelf-query'
import { shelfSharedStyles } from '../shelf-shared.stylex'
import { formatShelfPublicationAuthors, shelfFormatName } from './shelf-publication-collection'
import { useLoadWhenVisible } from './shelf-publication-layout'
import { shelfPublicationStyles } from './shelf-publication.stylex'

function PublicationCover({
  publication,
  scrollElementRef,
  sourceId,
}: {
  publication: ShelfPublication
  scrollElementRef: RefObject<HTMLDivElement | null>
  sourceId: string
}) {
  const { t } = useTranslation('app')
  const [coverRef, shouldLoad] = useLoadWhenVisible(scrollElementRef)
  const cover = useShelfCover(sourceId, publication.coverUrl, shouldLoad)
  const statusLabel = cover.state === 'loading'
    ? t('shelfLoadingCoverFor', { title: publication.title })
    : cover.state === 'error'
      ? t('shelfCoverUnavailableFor', { title: publication.title })
      : cover.state === 'missing'
        ? t('shelfNoCoverFor', { title: publication.title })
        : t('shelfCoverFor', { title: publication.title })

  return (
    <div
      ref={coverRef}
      {...stylex.props(shelfPublicationStyles.coverFrame)}
      aria-busy={cover.state === 'loading'}
      aria-label={statusLabel}
      data-cover-state={cover.state}
      role={cover.state === 'loading' || cover.state === 'error' ? 'status' : 'img'}
    >
      {cover.state === 'loaded' && cover.imageUrl
        ? <img {...stylex.props(shelfPublicationStyles.coverImage)} alt="" decoding="async" height={348} loading="lazy" src={cover.imageUrl} width={240} />
        : (
            <div
              {...stylex.props(
                shelfPublicationStyles.coverPlaceholder,
                cover.state === 'loading' && shelfPublicationStyles.coverPlaceholderLoading,
                cover.state === 'error' && shelfPublicationStyles.coverPlaceholderError,
              )}
              aria-hidden="true"
            >
              {cover.state === 'loading'
                ? <LoaderCircle {...stylex.props(shelfSharedStyles.spinner)} size={24} strokeWidth={1.45} />
                : cover.state === 'error'
                  ? <AlertCircle size={24} strokeWidth={1.45} />
                  : <BookOpen size={24} strokeWidth={1.35} />}
              <span {...stylex.props(shelfPublicationStyles.coverPlaceholderTitle)}>{publication.title}</span>
              {cover.state === 'loading'
                ? <small {...stylex.props(shelfPublicationStyles.coverPlaceholderStatus)}>{t('shelfLoadingCover')}</small>
                : cover.state === 'error'
                  ? <small {...stylex.props(shelfPublicationStyles.coverPlaceholderStatus)}>{t('shelfCoverUnavailable')}</small>
                  : null}
            </div>
          )}
    </div>
  )
}

export function ShelfPublicationItem({
  publication,
  scrollElementRef,
  source,
}: {
  publication: ShelfPublication
  scrollElementRef: RefObject<HTMLDivElement | null>
  source: ShelfSource
}) {
  const { t } = useTranslation('app')
  const queryClient = useQueryClient()
  const format = publication.links.find(link => link.rel.includes('acquisition'))?.type
  const formatName = format ? shelfFormatName(format) : null
  const cacheDetails = () => queryClient.setQueryData(
    shelfPublicationQueryKey(source.id, publication.id),
    cacheShelfPublication(publication, source),
  )

  return (
    <Link
      {...stylex.props(shelfPublicationStyles.publicationLink)}
      aria-label={t('shelfViewDetailsFor', { title: publication.title })}
      search={{ publication: publication.id, source: source.id }}
      to="/shelf/book"
      onClick={cacheDetails}
      onPointerDown={cacheDetails}
    >
      <article {...stylex.props(shelfPublicationStyles.publication)}>
        <PublicationCover publication={publication} scrollElementRef={scrollElementRef} sourceId={source.id} />
        <div {...stylex.props(shelfPublicationStyles.publicationText)}>
          <h3 {...stylex.props(shelfPublicationStyles.publicationTitle)} title={publication.title}>{publication.title}</h3>
          <p {...stylex.props(shelfPublicationStyles.publicationAuthor)} title={formatShelfPublicationAuthors(publication, t('shelfUnknownAuthor'))}>
            {formatShelfPublicationAuthors(publication, t('shelfUnknownAuthor'))}
          </p>
          {formatName
            ? <span {...stylex.props(shelfPublicationStyles.formatLabel)}>{formatName}</span>
            : null}
        </div>
      </article>
    </Link>
  )
}
