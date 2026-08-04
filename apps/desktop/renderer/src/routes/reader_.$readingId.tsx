import type { ReaderSource } from '@memorilo/editor/reader'
import { WindowReader } from '@memorilo/editor/reader'
import * as stylex from '@stylexjs/stylex'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, getRouteApi, Link } from '@tanstack/react-router'
import { AlertCircle, BookOpen, LoaderCircle } from 'lucide-react'
import { useMemo } from 'react'

import { usePageTitlebar } from '../components/page-titlebar'
import { useDesktopConfiguration } from '../configuration-context'
import { readerRouteStyles } from './-reader.stylex'
import { desktopEffect, shelfEffectQuery } from './-shelf-data'

const shelfReaderRouteApi = getRouteApi('/reader_/$readingId')

function ShelfReaderRoute() {
  const configuration = useDesktopConfiguration()
  const { readingId } = shelfReaderRouteApi.useParams()
  const documentQuery = useQuery(shelfEffectQuery.queryOptions({
    gcTime: 0,
    queryFn: () => desktopEffect(() => window.desktop.openShelfReading({ readingId })),
    queryKey: ['shelf-reading', readingId],
    retry: false,
    staleTime: Infinity,
  }))
  const source = useMemo<ReaderSource | null>(() => documentQuery.data
    ? {
        byteLength: documentQuery.data.byteLength,
        format: documentQuery.data.format,
        name: documentQuery.data.name,
        read: (offset, length) => window.desktop.readShelfReadingRange({ length, offset, readingId }),
      }
    : null, [documentQuery.data, readingId])
  const titlebar = useMemo(() => ({ navigation: 'hidden' as const }), [])
  usePageTitlebar(titlebar)

  return (
    <main {...stylex.props(readerRouteStyles.page, source && readerRouteStyles.pageOpen)}>
      {documentQuery.isPending
        ? (
            <section {...stylex.props(readerRouteStyles.routeStatus)} role="status">
              <LoaderCircle {...stylex.props(readerRouteStyles.spinner)} aria-hidden="true" size={24} strokeWidth={1.6} />
              <p {...stylex.props(readerRouteStyles.statusTitle)}>Opening book…</p>
            </section>
          )
        : documentQuery.error
          ? (
              <section {...stylex.props(readerRouteStyles.routeStatus)} role="alert">
                <AlertCircle {...stylex.props(readerRouteStyles.statusIcon)} aria-hidden="true" size={30} strokeWidth={1.5} />
                <h1 {...stylex.props(readerRouteStyles.statusTitle)}>Couldn’t open this book</h1>
                <p {...stylex.props(readerRouteStyles.statusDetail)}>{documentQuery.error.message}</p>
                <Link {...stylex.props(readerRouteStyles.openButton, readerRouteStyles.backLink)} search={{}} to="/shelf">
                  <BookOpen aria-hidden="true" size={15} strokeWidth={1.8} />
                  Shelf
                </Link>
              </section>
            )
          : source
            ? (
                <WindowReader
                  arrowKeyPageTurning={configuration.readerArrowKeyPageTurning}
                  initialPresentationMode={configuration.readerEpubPresentationMode}
                  source={source}
                />
              )
            : null}
    </main>
  )
}

export const Route = createFileRoute('/reader_/$readingId')({ component: ShelfReaderRoute })
