import type { ShelfBrowseGroup, ShelfPublication } from '@memorilo/shelf'
import type { RefObject } from 'react'
import { useEffect, useRef, useState } from 'react'
import { matchingShelfPublications } from './shelf-publication-collection'

export const shelfPublicationColumnGap = 24
export const shelfPublicationWidth = 140

const maximumPublicationColumns = 9

export function useLoadWhenVisible(
  rootRef: RefObject<HTMLElement | null>,
): [RefObject<HTMLDivElement | null>, boolean] {
  const elementRef = useRef<HTMLDivElement>(null)
  const [hasEnteredViewport, setHasEnteredViewport] = useState(false)

  useEffect(() => {
    if (hasEnteredViewport)
      return
    const element = elementRef.current
    const root = rootRef.current
    if (!element || !root)
      return

    const observer = new IntersectionObserver((entries) => {
      if (entries.some(entry => entry.isIntersecting))
        setHasEnteredViewport(true)
    }, {
      root,
      rootMargin: '80px 0px',
      threshold: 0.01,
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [hasEnteredViewport, rootRef])

  return [elementRef, hasEnteredViewport]
}

export type ShelfVirtualRow = {
  group: ShelfBrowseGroup
  id: string
  kind: 'heading'
  publicationCount: number
} | {
  group: ShelfBrowseGroup
  id: string
  kind: 'publications'
  publications: readonly ShelfPublication[]
}

export function shelfPublicationColumnCount(width: number): number {
  const availableWidth = Math.max(width, shelfPublicationWidth)
  const columns = Math.floor(
    (availableWidth + shelfPublicationColumnGap) / (shelfPublicationWidth + shelfPublicationColumnGap),
  )
  return Math.max(2, Math.min(maximumPublicationColumns, columns))
}

export function shelfPublicationGridTemplate(columns: number): string {
  if (!Number.isInteger(columns) || columns < 1 || columns > maximumPublicationColumns)
    throw new RangeError(`Shelf publication columns must be between 1 and ${maximumPublicationColumns}`)
  return `repeat(${columns}, minmax(0, ${shelfPublicationWidth}px))`
}

export function createShelfVirtualRows(
  groups: readonly ShelfBrowseGroup[],
  columns: number,
  searchQuery: string,
  showGroupHeadings: boolean,
): readonly ShelfVirtualRow[] {
  if (!Number.isInteger(columns) || columns < 1)
    throw new RangeError('Shelf publication columns must be a positive integer')

  const rows: ShelfVirtualRow[] = []
  for (const group of groups) {
    const publications = matchingShelfPublications(group.page?.publications ?? [], searchQuery)
    if (showGroupHeadings) {
      rows.push({
        group,
        id: `heading:${group.source.id}`,
        kind: 'heading',
        publicationCount: publications.length,
      })
    }
    for (let index = 0; index < publications.length; index += columns) {
      rows.push({
        group,
        id: `books:${group.source.id}:${index}`,
        kind: 'publications',
        publications: publications.slice(index, index + columns),
      })
    }
  }
  return rows
}
