import * as stylex from '@stylexjs/stylex'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { AlertCircle, LoaderCircle } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { usePageTitlebar } from '../../shared/page-titlebar'
import { formatShelfPublicationAuthors } from './publication/shelf-publication-collection'
import { ShelfBookCover } from './shelf-book-cover'
import { ShelfBookDetails } from './shelf-book-details'
import { projectShelfBookMetadata } from './shelf-book-metadata'
import { ShelfBookReadingControls } from './shelf-book-reading-controls'
import { shelfBookShellStyles as styles } from './shelf-book-shell.stylex'
import { desktopEffect, shelfEffectQuery, shelfPublicationQueryKey } from './shelf-query'

export interface ShelfBookSearch {
  publication: string
  source: string
}

export function ShelfBookPage({
  openReading,
  search,
}: {
  openReading: (readingId: string) => Promise<void>
  search: ShelfBookSearch
}) {
  const { t } = useTranslation('app')
  const bookDetailsTitle = t('shelfBookDetails')
  const titlebar = useMemo(() => ({ title: bookDetailsTitle }), [bookDetailsTitle])
  const detailsQuery = useQuery(shelfEffectQuery.queryOptions({
    queryFn: () => desktopEffect('shelf.get-publication-details', () => window.desktop.getShelfPublicationDetails({
      publicationId: search.publication,
      sourceId: search.source,
    })),
    queryKey: shelfPublicationQueryKey(search.source, search.publication),
    retry: false,
    staleTime: 0,
  }))
  usePageTitlebar(titlebar)

  const details = detailsQuery.data
  const metadata = details ? projectShelfBookMetadata(details.publication, details.source.name) : null

  return (
    <main {...stylex.props(styles.page)} aria-label={t('shelfBookDetails')}>
      <div {...stylex.props(styles.scrollViewport)}>
        {detailsQuery.isPending
          ? (
              <div {...stylex.props(styles.status)} role="status">
                <LoaderCircle {...stylex.props(styles.spinner)} size={22} strokeWidth={1.6} aria-hidden="true" />
                <span>{t('shelfOpeningBookDetails')}</span>
              </div>
            )
          : detailsQuery.error
            ? (
                <div {...stylex.props(styles.status)} role="alert">
                  <AlertCircle size={28} strokeWidth={1.5} aria-hidden="true" />
                  <h1 {...stylex.props(styles.statusTitle)}>{t('shelfCouldNotOpenBook')}</h1>
                  <p {...stylex.props(styles.statusText)}>{detailsQuery.error.message}</p>
                  <Link {...stylex.props(styles.shelfLink)} search={{}} to="/shelf">{t('shelfBackToShelf')}</Link>
                </div>
              )
            : details && metadata
              ? (
                  <div {...stylex.props(styles.content)}>
                    <section {...stylex.props(styles.overview)} aria-labelledby="book-title">
                      <div {...stylex.props(styles.coverColumn)}>
                        <ShelfBookCover publication={details.publication} sourceId={details.source.id} />
                      </div>
                      <div {...stylex.props(styles.information)}>
                        <h1 id="book-title" {...stylex.props(styles.title)}>{details.publication.title}</h1>
                        {details.publication.subtitle ? <p {...stylex.props(styles.subtitle)}>{details.publication.subtitle}</p> : null}
                        <p {...stylex.props(styles.authors)}>{formatShelfPublicationAuthors(details.publication, t('shelfUnknownAuthor'))}</p>
                        {metadata.headlineFacts.length > 0
                          ? (
                              <p {...stylex.props(styles.headlineFacts)}>
                                {metadata.headlineFacts.map((fact, index) => (
                                  <span key={fact} {...stylex.props(styles.headlineFact)}>
                                    {index > 0 ? <span {...stylex.props(styles.factSeparator)} aria-hidden="true">·</span> : null}
                                    {fact}
                                  </span>
                                ))}
                              </p>
                            )
                          : null}
                        <ShelfBookReadingControls
                          details={details}
                          openReading={openReading}
                          publicationId={search.publication}
                          sourceId={search.source}
                        />
                      </div>
                      <ShelfBookDetails metadata={metadata} />
                    </section>
                  </div>
                )
              : null}
      </div>
    </main>
  )
}
