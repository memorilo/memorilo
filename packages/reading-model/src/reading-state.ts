import type { ReadingAnnotation, ReadingEpubLocator } from './annotations'

export interface ReadingEpubPosition {
  format: 'epub'
  locator: ReadingEpubLocator
}

export interface ReadingPdfPosition {
  format: 'pdf'
  pageNumber: number
}

export interface ReadingComicPosition {
  format: 'cbr' | 'cbz'
  pageNumber: number
}

export interface ReadingTxtPosition {
  format: 'txt'
  offset: number
}

export type ReadingPosition = ReadingComicPosition | ReadingEpubPosition | ReadingPdfPosition | ReadingTxtPosition

export interface BookReadingState {
  annotations: readonly ReadingAnnotation[]
  position: ReadingPosition | null
}
