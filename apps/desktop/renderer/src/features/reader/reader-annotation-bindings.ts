import type { EditorNote } from '@memorilo/editor/note'
import type { ReaderAnnotation } from '@memorilo/editor/reader'

export function reconciledReaderAnnotations(
  note: EditorNote,
  bookTopicId: string,
  annotations: readonly ReaderAnnotation[],
): readonly ReaderAnnotation[] {
  const references = new Map(note.getEntries().flatMap((entry) => {
    if (entry.kind !== 'topic' || entry.topicType !== 'regular' || entry.parentId !== bookTopicId)
      return []
    const reference = entry.readerReference
    return reference?.annotationId === undefined || reference.bookTopicId !== bookTopicId
      ? []
      : [[entry.id, reference.annotationId] as const]
  }))
  let changed = false
  const next = annotations.map((annotation) => {
    if (annotation.annotationTopicId === undefined)
      return annotation
    if (references.get(annotation.annotationTopicId) === annotation.id)
      return annotation
    changed = true
    const { annotationTopicId: _annotationTopicId, ...detached } = annotation
    return detached
  })
  return changed ? next : annotations
}
