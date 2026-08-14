import type { DesktopBookTopicReadingContext } from '@memorilo/desktop-preload'
import type {
  ReaderAnnotation,
  ReaderAnnotationTopicCreateInput,
  ReaderPosition,
  ReaderSource,
} from '@memorilo/editor/reader'
import { createEditorNote, Editor } from '@memorilo/editor'
import { WindowReader } from '@memorilo/editor/reader'
import { PanelRight } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useDesktopConfiguration } from '../../shared/configuration'
import { desktopEditorAdapters } from '../notes/editor/note-editor-session'
import { useNoteFavorite } from '../notes/note-favorite'
import { NoteInspectorContent } from '../notes/note-inspector'
import { NoteInspectorActions } from '../notes/note-inspector-actions'
import { useNoteInspectorEntries } from '../notes/note-inspector-state'
import { useNotePersistence } from '../notes/persistence/note-persistence-hooks'
import { boundReaderPresentation } from './bound-reader-presentation'
import { reconciledReaderAnnotations } from './reader-annotation-bindings'
import { createReaderAnnotationTopic } from './reader-annotation-topics'

export function BoundShelfReader({
  context,
  initialAnnotationId,
  initialPosition,
  source,
}: {
  context: DesktopBookTopicReadingContext
  initialAnnotationId?: string
  initialPosition: ReaderPosition | null
  source: ReaderSource
}) {
  const configuration = useDesktopConfiguration()
  const { t } = useTranslation('editor')
  const { enqueue, getPendingChanges } = useNotePersistence(context.note.id)
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
  const bookTopic = useMemo(() => note.getBookTopic(context.topicId), [context.topicId, note])
  const editorAdapters = useMemo(
    () => desktopEditorAdapters(configuration.networkImagePasteBehavior),
    [configuration.networkImagePasteBehavior],
  )
  const initialReadingState = useRef(bookTopic.getReadingState()).current
  const initialReaderPosition = useRef(initialReadingState.position ?? initialPosition).current
  const initialAnnotations = useRef(reconciledReaderAnnotations(
    note,
    context.topicId,
    initialReadingState.annotations,
  )).current
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
    const next = bookTopic.getReadingState()
    const nextAnnotations = reconciledReaderAnnotations(note, context.topicId, next.annotations)
    positionRef.current = next.position
    annotationsRef.current = nextAnnotations
    setAnnotations(nextAnnotations)
    setEntries(note.getEntries())
    if (nextAnnotations !== next.annotations)
      bookTopic.setAnnotations(nextAnnotations)
  }, [bookTopic, context.topicId, note])
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
  const createAnnotationTopic = useCallback((input: ReaderAnnotationTopicCreateInput, signal: AbortSignal) => {
    return createReaderAnnotationTopic({
      bookTopicId: context.topicId,
      captureReaderRegion: window.desktop.captureReaderRegion,
      createTopic: note.createTopic,
      input,
      saveImage: window.desktop.saveImage,
      signal,
      viewport: { height: window.innerHeight, width: window.innerWidth },
    })
  }, [context.topicId, note])
  const detachAnnotationTopic = useCallback(async (topicId: string) => {
    const reference = note.getTopicReaderReference(topicId)
    if (!reference)
      throw new Error(`Annotation Topic ${topicId} has no Reader source`)
    note.setTopicReaderReference(topicId, { source: reference.source })
  }, [note])
  return (
    <WindowReader
      annotationCopyBookTitle={presentation.annotationCopyBookTitle}
      annotationCopyFormat={configuration.readerAnnotationCopyFormat}
      annotationEditingEnabled
      annotations={annotations}
      arrowKeyPageTurning={configuration.readerArrowKeyPageTurning}
      auxiliarySidebar={{
        content: (
          <NoteInspectorContent
            collapsedEntryIds={collapsedEntryIds}
            currentTopicId={context.topicId}
            entries={entries}
            noteId={note.id}
            onToggleEntry={toggleEntry}
            showTitle={false}
          />
        ),
        icon: <PanelRight aria-hidden="true" size={14} strokeWidth={1.8} />,
        label: t('noteTitle'),
      }}
      initialPosition={initialReaderPosition}
      initialPresentationMode={configuration.readerEpubPresentationMode}
      initialAnnotationId={initialAnnotationId}
      onCreateAnnotationTopic={createAnnotationTopic}
      onDetachAnnotationTopic={detachAnnotationTopic}
      renderAnnotationEditor={({ annotation, readOnly }) => {
        if (!annotation.annotationTopicId)
          throw new Error(`Reader annotation ${annotation.id} has no Topic Editor binding`)
        return (
          <Editor
            adapters={editorAdapters}
            layout="embedded"
            outline={{ outdentBehavior: configuration.outdentBehavior }}
            readOnly={readOnly}
            topic={note.getTopic(annotation.annotationTopicId)}
          />
        )
      }}
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
      onPositionChange={onPositionChange}
    />
  )
}
