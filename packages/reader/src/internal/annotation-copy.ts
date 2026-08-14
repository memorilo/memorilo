import type {
  ReaderAnnotation,
  ReaderAnnotationCopyFormat,
} from '../types'

export function annotationCopyText(
  annotation: ReaderAnnotation,
  format: ReaderAnnotationCopyFormat,
  bookTitle: string | undefined,
  location: string,
): string {
  if (annotation.anchor.type !== 'text')
    throw new TypeError('Only text annotations can be copied')
  const text = annotation.anchor.quote.exact
  if (format === 'text' || bookTitle === undefined)
    return text
  if (format === 'text-book')
    return `${text}\n\n${bookTitle}`
  return `${text}\n\n${bookTitle} - ${location}`
}
