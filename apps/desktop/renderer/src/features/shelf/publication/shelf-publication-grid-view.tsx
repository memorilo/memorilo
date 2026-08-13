import type { ShelfBrowseGroup } from '@memorilo/shelf'
import type { RefObject } from 'react'
import * as stylex from '@stylexjs/stylex'
import { useVirtualizer } from '@tanstack/react-virtual'
import { AlertCircle, Globe2 } from 'lucide-react'
import { useCallback, useLayoutEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ShelfPublicationItem } from './shelf-publication-card'
import { shelfBrowseIssueTranslation } from './shelf-publication-collection'
import {
  createShelfVirtualRows,
  shelfPublicationColumnCount,
  shelfPublicationGridTemplate,
} from './shelf-publication-layout'
import { shelfPublicationStyles } from './shelf-publication.stylex'

function useElementWidth(elementRef: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0)

  useLayoutEffect(() => {
    const element = elementRef.current
    if (!element)
      return
    const update = () => setWidth(element.clientWidth)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [elementRef])

  return width
}

export function VirtualShelf({
  groups,
  query,
  scrollElementRef,
  showGroupHeadings,
}: {
  groups: readonly ShelfBrowseGroup[]
  query: string
  scrollElementRef: RefObject<HTMLDivElement | null>
  showGroupHeadings: boolean
}) {
  const { t } = useTranslation('app')
  const viewportWidth = useElementWidth(scrollElementRef)
  const columns = shelfPublicationColumnCount(viewportWidth)
  const rows = useMemo(
    () => createShelfVirtualRows(groups, columns, query, showGroupHeadings),
    [columns, groups, query, showGroupHeadings],
  )
  const getItemKey = useCallback((index: number) => {
    const row = rows[index]
    if (!row)
      throw new RangeError(`Shelf virtual row ${index} is outside the collection`)
    return row.id
  }, [rows])
  const estimateSize = useCallback((index: number) => rows[index]?.kind === 'heading' ? 74 : 306, [rows])
  const virtualizer = useVirtualizer({
    count: rows.length,
    estimateSize,
    getItemKey,
    getScrollElement: () => scrollElementRef.current,
    overscan: 2,
  })

  return (
    <div {...stylex.props(shelfPublicationStyles.virtualSizer)} style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map((virtualItem) => {
        const row = rows[virtualItem.index]
        if (!row)
          throw new RangeError(`Shelf virtual row ${virtualItem.index} is outside the collection`)
        const issueTranslation = row.group.issue === null
          ? null
          : shelfBrowseIssueTranslation(row.group.issue)
        return (
          <div
            key={row.id}
            ref={virtualizer.measureElement}
            {...stylex.props(shelfPublicationStyles.virtualRow)}
            data-index={virtualItem.index}
            style={{ transform: `translateY(${virtualItem.start}px)` }}
          >
            {row.kind === 'heading'
              ? (
                  <section {...stylex.props(shelfPublicationStyles.groupHeading)} aria-label={row.group.source.name}>
                    <div {...stylex.props(shelfPublicationStyles.groupTitleLine)}>
                      <span {...stylex.props(shelfPublicationStyles.sourceGlyph)} aria-hidden="true">
                        <Globe2 size={15} strokeWidth={1.8} />
                      </span>
                      <h2 {...stylex.props(shelfPublicationStyles.groupTitle)}>{row.group.source.name}</h2>
                      {row.publicationCount > 0 || row.group.page?.navigation.length === 0
                        ? <span {...stylex.props(shelfPublicationStyles.groupCount)}>{row.publicationCount}</span>
                        : null}
                    </div>
                    {issueTranslation
                      ? (
                          <div {...stylex.props(shelfPublicationStyles.inlineIssue)} role="status">
                            <AlertCircle size={14} strokeWidth={1.9} aria-hidden="true" />
                            <span>{t(issueTranslation.key, issueTranslation.options)}</span>
                          </div>
                        )
                      : null}
                  </section>
                )
              : (
                  <div
                    {...stylex.props(shelfPublicationStyles.publicationRow)}
                    style={{ gridTemplateColumns: shelfPublicationGridTemplate(columns) }}
                  >
                    {row.publications.map(publication => (
                      <ShelfPublicationItem
                        key={publication.id}
                        publication={publication}
                        scrollElementRef={scrollElementRef}
                        source={row.group.source}
                      />
                    ))}
                  </div>
                )}
          </div>
        )
      })}
    </div>
  )
}
