import type {
  ReaderAnnotation,
  ReaderAnnotationCopyFormat,
} from '../types'
import { readingAnnotationText } from '@memorilo/reading-model'

export function annotationCopyText(
  annotation: ReaderAnnotation,
  format: ReaderAnnotationCopyFormat,
  bookTitle: string | undefined,
  location: string,
): string {
  const text = readingAnnotationText(annotation)
  if (text === null)
    throw new TypeError('Only text annotations can be copied')
  if (format === 'text' || bookTitle === undefined)
    return text
  if (format === 'text-book')
    return `${text}\n\n${bookTitle}`
  return `${text}\n\n${bookTitle} - ${location}`
}
