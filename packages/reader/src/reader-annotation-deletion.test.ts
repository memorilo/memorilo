import type { ReaderAnnotation } from './types'
import { describe, expect, it, vi } from 'vitest'
import {
  prepareReaderAnnotationDeletion,
  requestReaderAnnotationDeletion,
  startReaderAnnotationDeletionPreparation,
} from './reader-annotation-deletion'

function annotation(annotationTopicId?: string): ReaderAnnotation {
  return {
    anchors: [{
      end: 8,
      format: 'txt',
      quote: { exact: 'selected' },
      start: 0,
      type: 'text',
    }],
    ...(annotationTopicId === undefined ? {} : { annotationTopicId }),
    color: 'yellow',
    createdAt: 1,
    id: 'annotation-1',
    style: 'highlight',
    updatedAt: 1,
  }
}

describe('reader annotation deletion preparation', () => {
  it('fails fast when a linked annotation Topic cannot be detached', () => {
    expect(() => prepareReaderAnnotationDeletion(annotation('topic-1'), {})).toThrow(
      'Reader annotation Topic detachment is unavailable',
    )
  })

  it('uses the aggregate preparation callback before the legacy detach callback', async () => {
    const onDetachAnnotationTopic = vi.fn(async () => undefined)
    const onPrepareAnnotationDeletion = vi.fn(async () => undefined)
    const linked = annotation('topic-1')

    await prepareReaderAnnotationDeletion(linked, {
      onDetachAnnotationTopic,
      onPrepareAnnotationDeletion,
    })

    expect(onPrepareAnnotationDeletion).toHaveBeenCalledWith(linked)
    expect(onDetachAnnotationTopic).not.toHaveBeenCalled()
  })

  it('does not cancel in-progress work when deletion preparation cannot start', () => {
    const onPreparationStarted = vi.fn()

    expect(() => startReaderAnnotationDeletionPreparation(
      annotation('topic-1'),
      {},
      onPreparationStarted,
    )).toThrow('Reader annotation Topic detachment is unavailable')

    expect(onPreparationStarted).not.toHaveBeenCalled()
  })

  it('opens confirmation without cancelling work or removing a linked annotation', () => {
    const abortInProgress = vi.fn()
    const removeAnnotation = vi.fn()
    const requestConfirmation = vi.fn()

    requestReaderAnnotationDeletion({
      annotationTopicId: 'topic-1',
      imageOcclusionTopicIds: ['occlusion-1'],
    }, {
      hasPendingWork: false,
      abortInProgress,
      removeAnnotation,
      requestConfirmation,
    })

    expect(requestConfirmation).toHaveBeenCalledOnce()
    expect(abortInProgress).not.toHaveBeenCalled()
    expect(removeAnnotation).not.toHaveBeenCalled()
  })

  it('opens confirmation before cancelling work that has not persisted a dependent yet', () => {
    const abortInProgress = vi.fn()
    const removeAnnotation = vi.fn()
    const requestConfirmation = vi.fn()

    requestReaderAnnotationDeletion({
      annotationTopicId: undefined,
      imageOcclusionTopicIds: [],
    }, {
      hasPendingWork: true,
      abortInProgress,
      removeAnnotation,
      requestConfirmation,
    })

    expect(requestConfirmation).toHaveBeenCalledOnce()
    expect(abortInProgress).not.toHaveBeenCalled()
    expect(removeAnnotation).not.toHaveBeenCalled()
  })
})
