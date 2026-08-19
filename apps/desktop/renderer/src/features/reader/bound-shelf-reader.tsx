import type { DesktopBookTopicReadingContext, DesktopNoteExternalUpdate } from '@memorilo/desktop-api'
import type {
  ReaderAnnotation,
  ReaderAnnotationTopicCreateInput,
  ReaderPosition,
  ReaderSource,
} from '@memorilo/editor/reader'
import type { ReaderCaptureRegion } from './reader-capture'
import { createBoundReaderSession } from '@memorilo/application/bound-reader'
import { BoundReaderSurface, createEditorNote } from '@memorilo/editor'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDesktopConfiguration } from '../../shared/configuration'

import { desktopRequests } from '../../shared/desktop-requests'
import { desktopEditorAdapters } from '../notes/editor/note-editor-session'
import { useNoteFavorite } from '../notes/note-favorite'
import { NoteInspectorActions } from '../notes/note-inspector-actions'
import { useNoteInspectorEntries } from '../notes/note-inspector-state'
import { applyExternalNoteUpdate } from '../notes/note-runtime'
import { useFlushNotePersistence, useNotePersistence } from '../notes/persistence/note-persistence-hooks'
import { boundReaderPresentation } from './bound-reader-presentation'
import {
  prepareReaderAnnotationTopicsForDeletion,
  readerAnnotationDependents,
} from './reader-annotation-bindings'
import { createReaderAnnotationTopic } from './reader-annotation-topics'
import { captureReaderAnnotationRegion } from './reader-capture'

export function BoundShelfReader({
  context,
  initialAnnotationId,
  initialPosition,
  onOpenTopic,
  source,
}: {
  context: DesktopBookTopicReadingContext
  initialAnnotationId?: string
  initialPosition: ReaderPosition | null
  onOpenTopic: (topicId: string) => Promise<void>
  source: ReaderSource
}) {
  const configuration = useDesktopConfiguration()
  const { t } = useTranslation('editor')
  const { enqueue, getPendingChanges } = useNotePersistence(context.note.id)
  const flushNotePersistence = useFlushNotePersistence()
  const { collapsedEntryIds, toggleEntry } = useNoteInspectorEntries(context.note.id)
  const { favorite, favoritePending, toggleFavorite } = useNoteFavorite(context.note)
  const note = useMemo(() => {
    const restored = createEditorNote({
      id: context.note.id,
      snapshot: context.note.snapshot,
      title: context.note.title,
    })
    getPendingChanges().forEach(change => restored.importUpdates(change.update))
    return restored
  }, [context.note.id, context.note.snapshot, context.note.title, getPendingChanges])
  const readerSession = useMemo(
    () => createBoundReaderSession(note, context.topicId, initialPosition),
    [context.topicId, initialPosition, note],
  )
  const { bookTopic } = readerSession
  const applyTaskExternal = useCallback(
    (external: DesktopNoteExternalUpdate) => applyExternalNoteUpdate(note, external) !== null,
    [note],
  )
  const editorAdapters = useMemo(
    () => desktopEditorAdapters(configuration.networkImagePasteBehavior, {
      applyExternal: applyTaskExternal,
      flush: flushNotePersistence,
      noteId: context.note.id,
      topicId: context.topicId,
    }),
    [applyTaskExternal, configuration.networkImagePasteBehavior, context.note.id, context.topicId, flushNotePersistence],
  )
  const initialReadingState = useRef(readerSession.initialReadingState).current
  const initialReaderPosition = useRef(readerSession.initialPosition).current
  const initialAnnotations = useRef(readerSession.initialAnnotations).current
  const initialReconciliationAppliedRef = useRef(false)
  const [annotations, setAnnotations] = useState(initialAnnotations)
  const [entries, setEntries] = useState(() => note.getEntries())
  const positionRef = useRef(initialReadingState.position)
  const annotationsRef = useRef(initialAnnotations)
  const presentation = boundReaderPresentation({
    bookTitle: context.book.book.title,
    noteTitle: context.note.title,
    topicTitle: context.topicTitle,
  })

  const syncNoteProjection = useCallback(() => {
    const next = readerSession.project()
    positionRef.current = next.position
    annotationsRef.current = next.annotations
    setAnnotations(next.annotations)
    setEntries(next.entries)
    if (next.annotations !== next.readingState.annotations)
      bookTopic.setAnnotations(next.annotations)
  }, [bookTopic, readerSession])
  const handleNoteChange = useCallback((change: { noteId: string, update: Uint8Array }) => {
    enqueue(change)
    syncNoteProjection()
  }, [enqueue, syncNoteProjection])

  useEffect(() => {
    const unsubscribeLocal = note.subscribe(handleNoteChange)
    const unsubscribeExternal = window.desktop.subscribeNoteUpdates((update) => {
      if (update.noteId !== note.id)
        return
      note.importUpdates(update.update)
      syncNoteProjection()
    })
    if (initialAnnotations !== initialReadingState.annotations && !initialReconciliationAppliedRef.current) {
      initialReconciliationAppliedRef.current = true
      bookTopic.setAnnotations(initialAnnotations)
    }
    if (initialReadingState.position === null && initialReaderPosition !== null)
      bookTopic.setPosition(initialReaderPosition)
    return () => {
      unsubscribeLocal()
      unsubscribeExternal()
    }
  }, [
    bookTopic,
    handleNoteChange,
    initialAnnotations,
    initialReaderPosition,
    initialReadingState.annotations,
    initialReadingState.position,
    note,
    syncNoteProjection,
  ])

  const onPositionChange = useCallback((position: ReaderPosition) => {
    if (JSON.stringify(position) === JSON.stringify(positionRef.current))
      return
    bookTopic.setPosition(position)
  }, [bookTopic])
  const onAnnotationsChange = useCallback((nextAnnotations: readonly ReaderAnnotation[]) => {
    if (JSON.stringify(nextAnnotations) === JSON.stringify(annotationsRef.current))
      return
    bookTopic.setAnnotations(nextAnnotations)
  }, [bookTopic])
  const captureAnnotationRegion = useCallback((region: ReaderCaptureRegion) => captureReaderAnnotationRegion({
    captureReaderRegion: desktopRequests.captureReaderRegion,
    region,
  }), [])
  const createAnnotationTopic = useCallback((input: ReaderAnnotationTopicCreateInput, signal: AbortSignal) => {
    return createReaderAnnotationTopic({
      bookTopicId: context.topicId,
      captureReaderRegion: captureAnnotationRegion,
      createTopic: note.createTopic,
      input,
      saveImage: desktopRequests.saveImage,
      signal,
      viewport: { height: window.innerHeight, width: window.innerWidth },
    })
  }, [captureAnnotationRegion, context.topicId, note])
  const getAnnotationDependents = useCallback(
    (annotation: ReaderAnnotation) => readerAnnotationDependents(note, context.topicId, annotation),
    [context.topicId, note],
  )
  const prepareAnnotationDeletion = useCallback(async (annotation: ReaderAnnotation) => {
    prepareReaderAnnotationTopicsForDeletion(note, context.topicId, annotation)
  }, [context.topicId, note])
  const openImageOcclusion = useCallback(async (
    input: ReaderAnnotationTopicCreateInput,
    signal: AbortSignal,
  ) => {
    if (!configuration.learning.enabled)
      throw new Error('Learning features are disabled')
    const { openReaderRegionImageOcclusion, readReaderImageSize } = await import('./reader-image-occlusion')
    const topicId = await openReaderRegionImageOcclusion({
      bookTopicId: context.topicId,
      captureReaderRegion: captureAnnotationRegion,
      input,
      note,
      readImageSize: readReaderImageSize,
      saveImage: desktopRequests.saveImage,
      signal,
      title: t('imageOcclusion.defaultTitle'),
      viewport: { height: window.innerHeight, width: window.innerWidth },
    })
    signal.throwIfAborted()
    await onOpenTopic(topicId)
  }, [captureAnnotationRegion, configuration.learning.enabled, context.topicId, note, onOpenTopic, t])
  return (
    <BoundReaderSurface
      adapters={editorAdapters}
      annotationCopyBookTitle={presentation.annotationCopyBookTitle}
      annotationCopyFormat={configuration.readerAnnotationCopyFormat}
      annotationEditingEnabled
      annotations={annotations}
      arrowKeyPageTurning={configuration.readerArrowKeyPageTurning}
      auxiliarySidebarLabel={t('noteTitle')}
      chrome="window"
      collapsedEntryIds={collapsedEntryIds}
      currentTopicId={context.topicId}
      entries={entries}
      imageOcclusionEnabled={configuration.learning.enabled}
      initialPosition={initialReaderPosition}
      initialPresentationMode={configuration.readerEpubPresentationMode}
      initialAnnotationId={initialAnnotationId}
      learningEnabled={configuration.learning.enabled}
      note={note}
      onOpenTopic={(topicId) => {
        void onOpenTopic(topicId)
      }}
      pageMode={configuration.readerPageMode}
      onCreateAnnotationTopic={createAnnotationTopic}
      onPrepareAnnotationDeletion={prepareAnnotationDeletion}
      onGetAnnotationDependents={getAnnotationDependents}
      onOpenReaderRegionImageOcclusion={configuration.learning.enabled ? openImageOcclusion : undefined}
      outline={{ outdentBehavior: configuration.outdentBehavior }}
      sidebarActions={({ active, toggle }) => (
        <NoteInspectorActions
          favorite={favorite}
          favoritePending={favoritePending}
          inspectorVisible={active}
          onToggleFavorite={toggleFavorite}
          onToggleInspector={toggle}
        />
      )}
      source={source}
      title={presentation.title}
      onAnnotationsChange={onAnnotationsChange}
      onToggleEntry={toggleEntry}
      onPositionChange={onPositionChange}
    />
  )
}
