import type { TFunction } from 'i18next'
import type { RefObject } from 'react'
import type {
  ReaderAnnotation,
  ReaderProps,
} from './types'
import { createLatestOperationSupervisor } from '@memorilo/effect-lifecycle'
import { useCallback, useEffect, useRef, useState } from 'react'
import { findAnnotationClientRect } from './internal/annotation-geometry'
import { readerAnnotationLabel } from './internal/annotation-label'
import {
  requestReaderAnnotationDeletion,
  startReaderAnnotationDeletionPreparation,
} from './reader-annotation-deletion'

type LinkedAnnotationOperationChannel
  = | `create-topic:${string}`
    | `open-image-occlusion:${string}`

interface ReaderAnnotationMutations {
  annotations: readonly ReaderAnnotation[]
  attachAnnotationTopic: (annotationId: string, topicId: string) => void
  removeAnnotation: (annotationId: string) => void
}

interface UseReaderLinkedAnnotationWorkflowOptions {
  annotationWorkflow: ReaderAnnotationMutations
  engineRef: RefObject<HTMLDivElement | null>
  onCreateAnnotationTopic: ReaderProps['onCreateAnnotationTopic']
  onDetachAnnotationTopic: ReaderProps['onDetachAnnotationTopic']
  onGetAnnotationDependents: ReaderProps['onGetAnnotationDependents']
  onOpenReaderRegionImageOcclusion: ReaderProps['onOpenReaderRegionImageOcclusion']
  onPrepareAnnotationDeletion: ReaderProps['onPrepareAnnotationDeletion']
  reportError: (error: unknown) => void
  t: TFunction
}

function createTopicChannel(annotationId: string): LinkedAnnotationOperationChannel {
  return `create-topic:${annotationId}`
}

function imageOcclusionChannel(annotationId: string): LinkedAnnotationOperationChannel {
  return `open-image-occlusion:${annotationId}`
}

export function useReaderLinkedAnnotationWorkflow({
  annotationWorkflow,
  engineRef,
  onCreateAnnotationTopic,
  onDetachAnnotationTopic,
  onGetAnnotationDependents,
  onOpenReaderRegionImageOcclusion,
  onPrepareAnnotationDeletion,
  reportError,
  t,
}: UseReaderLinkedAnnotationWorkflowOptions) {
  const [operations] = useState(() => createLatestOperationSupervisor<LinkedAnnotationOperationChannel>(
    'Reader linked annotation operations',
    { concurrency: 'parallel', shutdown: 'interrupt' },
  ))
  const pendingChannels = useRef(new Set<LinkedAnnotationOperationChannel>())
  const mounted = useRef(true)
  const [creatingTopicIds, setCreatingTopicIds] = useState<ReadonlySet<string>>(() => new Set())
  const [openingImageOcclusionIds, setOpeningImageOcclusionIds] = useState<ReadonlySet<string>>(() => new Set())
  const [deletingAnnotationId, setDeletingAnnotationId] = useState<string | null>(null)
  const [deletePending, setDeletePending] = useState(false)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      void operations.close().catch(reportError)
    }
  }, [operations, reportError])

  const setPending = useCallback((
    channel: LinkedAnnotationOperationChannel,
    annotationId: string,
    pending: boolean,
  ) => {
    if (pending)
      pendingChannels.current.add(channel)
    else
      pendingChannels.current.delete(channel)
    if (!mounted.current)
      return
    const update = (current: ReadonlySet<string>): ReadonlySet<string> => {
      if (pending === current.has(annotationId))
        return current
      const next = new Set(current)
      if (pending)
        next.add(annotationId)
      else
        next.delete(annotationId)
      return next
    }
    if (channel.startsWith('create-topic:'))
      setCreatingTopicIds(update)
    else
      setOpeningImageOcclusionIds(update)
  }, [])

  const abortAnnotationOperations = useCallback((annotationId: string) => {
    operations.invalidate(createTopicChannel(annotationId))
    operations.invalidate(imageOcclusionChannel(annotationId))
  }, [operations])

  const addAnnotationTopic = useCallback((annotation: ReaderAnnotation) => {
    if (!onCreateAnnotationTopic) {
      reportError(new Error('Reader annotation Topic creation is unavailable'))
      return
    }
    const engine = engineRef.current
    if (!engine) {
      reportError(new Error('Reader annotation surface is unavailable'))
      return
    }
    const clientRect = findAnnotationClientRect(engine, annotation.id)
    if (!clientRect) {
      reportError(new Error(`Reader annotation ${annotation.id} is not visible`))
      return
    }
    const channel = createTopicChannel(annotation.id)
    if (pendingChannels.current.has(channel))
      return
    setPending(channel, annotation.id, true)
    void operations.run(channel, async ({ signal }) => onCreateAnnotationTopic({
      annotation,
      clientRect,
      location: readerAnnotationLabel(annotation, t),
    }, signal)).then((outcome) => {
      if (outcome.status === 'current')
        annotationWorkflow.attachAnnotationTopic(annotation.id, outcome.value)
    }).catch(reportError).finally(() => setPending(channel, annotation.id, false))
  }, [annotationWorkflow, engineRef, onCreateAnnotationTopic, operations, reportError, setPending, t])

  const openReaderRegionImageOcclusion = useCallback((annotation: ReaderAnnotation) => {
    if (annotation.anchors[0].type !== 'region')
      throw new TypeError(`Reader annotation ${annotation.id} is not a region`)
    if (!onOpenReaderRegionImageOcclusion) {
      reportError(new Error('Reader region image occlusion is unavailable'))
      return
    }
    const engine = engineRef.current
    if (!engine) {
      reportError(new Error('Reader annotation surface is unavailable'))
      return
    }
    const clientRect = findAnnotationClientRect(engine, annotation.id)
    if (!clientRect) {
      reportError(new Error(`Reader annotation ${annotation.id} is not visible`))
      return
    }
    const channel = imageOcclusionChannel(annotation.id)
    if (pendingChannels.current.has(channel))
      return
    setPending(channel, annotation.id, true)
    void operations.run(channel, async ({ signal }) => onOpenReaderRegionImageOcclusion({
      annotation,
      clientRect,
      location: readerAnnotationLabel(annotation, t),
    }, signal)).catch(reportError).finally(() => setPending(channel, annotation.id, false))
  }, [engineRef, onOpenReaderRegionImageOcclusion, operations, reportError, setPending, t])

  const requestDeleteAnnotation = useCallback((annotation: ReaderAnnotation) => {
    const dependents = onGetAnnotationDependents?.(annotation) ?? {
      ...(annotation.annotationTopicId === undefined ? {} : { annotationTopicId: annotation.annotationTopicId }),
      imageOcclusionTopicIds: [],
    }
    requestReaderAnnotationDeletion(dependents, {
      abortInProgress: () => abortAnnotationOperations(annotation.id),
      hasPendingWork: pendingChannels.current.has(createTopicChannel(annotation.id))
        || pendingChannels.current.has(imageOcclusionChannel(annotation.id)),
      removeAnnotation: () => annotationWorkflow.removeAnnotation(annotation.id),
      requestConfirmation: () => setDeletingAnnotationId(annotation.id),
    })
  }, [abortAnnotationOperations, annotationWorkflow, onGetAnnotationDependents])

  const finishLinkedDeletion = useCallback(() => {
    if (deletingAnnotationId === null)
      throw new Error('No linked Reader annotation is pending deletion')
    const annotation = annotationWorkflow.annotations.find(candidate => candidate.id === deletingAnnotationId)
    if (!annotation)
      throw new Error(`Reader annotation ${deletingAnnotationId} does not exist`)
    setDeletePending(true)
    let preparation: Promise<void>
    try {
      preparation = startReaderAnnotationDeletionPreparation(
        annotation,
        { onDetachAnnotationTopic, onPrepareAnnotationDeletion },
        () => abortAnnotationOperations(annotation.id),
      )
    }
    catch (error) {
      reportError(error)
      setDeletePending(false)
      return
    }
    void preparation.then(() => {
      annotationWorkflow.removeAnnotation(annotation.id)
      setDeletingAnnotationId(null)
    }).catch(reportError).finally(() => {
      if (mounted.current)
        setDeletePending(false)
    })
  }, [
    abortAnnotationOperations,
    annotationWorkflow,
    deletingAnnotationId,
    onDetachAnnotationTopic,
    onPrepareAnnotationDeletion,
    reportError,
  ])

  return {
    addAnnotationTopic,
    cancelDeletion: () => setDeletingAnnotationId(null),
    creatingTopicIds,
    deletePending,
    deletingAnnotationId,
    finishLinkedDeletion,
    openReaderRegionImageOcclusion,
    openingImageOcclusionIds,
    requestDeleteAnnotation,
  }
}
