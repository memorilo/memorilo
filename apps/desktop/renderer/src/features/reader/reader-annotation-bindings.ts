import type { EditorNote } from '@memorilo/editor/note'
import type { ReaderAnnotation, ReaderAnnotationDependents } from '@memorilo/editor/reader'

export function readerAnnotationDependents(
  note: EditorNote,
  bookTopicId: string,
  annotation: ReaderAnnotation,
): ReaderAnnotationDependents {
  const imageOcclusionTopic = annotation.anchor.type === 'region'
    ? note.findImageOcclusionTopic({
        annotationId: annotation.id,
        kind: 'reader-region',
        topicId: bookTopicId,
      })
    : null
  const imageOcclusionTopicIds = imageOcclusionTopic === null
    ? []
    : [imageOcclusionTopic.topicId]
  return {
    ...(annotation.annotationTopicId === undefined ? {} : { annotationTopicId: annotation.annotationTopicId }),
    imageOcclusionTopicIds,
  }
}

export function prepareReaderAnnotationTopicsForDeletion(
  note: EditorNote,
  bookTopicId: string,
  annotation: ReaderAnnotation,
): void {
  const dependents = readerAnnotationDependents(note, bookTopicId, annotation)
  if (dependents.annotationTopicId === undefined)
    return
  const reference = note.getTopicReaderReference(dependents.annotationTopicId)
  if (!reference)
    throw new Error(`Annotation Topic ${dependents.annotationTopicId} has no Reader source`)
  note.setTopicReaderReference(dependents.annotationTopicId, { source: reference.source })
}

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
