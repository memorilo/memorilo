import type { ReaderAnnotation, ReaderAnnotationDependents } from './types'

export interface ReaderAnnotationDeletionCallbacks {
  onDetachAnnotationTopic?: (topicId: string) => Promise<void>
  onPrepareAnnotationDeletion?: (annotation: ReaderAnnotation) => Promise<void>
}

interface ReaderAnnotationDeletionRequestCallbacks {
  abortInProgress: () => void
  hasPendingWork: boolean
  removeAnnotation: () => void
  requestConfirmation: () => void
}

export function requestReaderAnnotationDeletion(
  dependents: ReaderAnnotationDependents,
  callbacks: ReaderAnnotationDeletionRequestCallbacks,
): void {
  if (callbacks.hasPendingWork
    || dependents.annotationTopicId !== undefined
    || dependents.imageOcclusionTopicIds.length > 0) {
    callbacks.requestConfirmation()
    return
  }
  callbacks.abortInProgress()
  callbacks.removeAnnotation()
}

export function prepareReaderAnnotationDeletion(
  annotation: ReaderAnnotation,
  callbacks: ReaderAnnotationDeletionCallbacks,
): Promise<void> {
  if (callbacks.onPrepareAnnotationDeletion)
    return callbacks.onPrepareAnnotationDeletion(annotation)
  if (annotation.annotationTopicId === undefined)
    return Promise.resolve()
  if (!callbacks.onDetachAnnotationTopic)
    throw new Error('Reader annotation Topic detachment is unavailable')
  return callbacks.onDetachAnnotationTopic(annotation.annotationTopicId)
}

export function startReaderAnnotationDeletionPreparation(
  annotation: ReaderAnnotation,
  callbacks: ReaderAnnotationDeletionCallbacks,
  onPreparationStarted: () => void,
): Promise<void> {
  const preparation = prepareReaderAnnotationDeletion(annotation, callbacks)
  onPreparationStarted()
  return preparation
}
