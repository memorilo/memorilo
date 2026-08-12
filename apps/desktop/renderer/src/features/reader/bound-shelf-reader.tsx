import type { DesktopBookTopicReadingContext } from '@memorilo/desktop-preload'
import type { ReaderAnnotation, ReaderPosition, ReaderSource } from '@memorilo/editor/reader'
import { createEditorNote } from '@memorilo/editor'
import { WindowReader } from '@memorilo/editor/reader'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useDesktopConfiguration } from '../../shared/configuration'
import { useNotePersistence } from '../notes/persistence/note-persistence-hooks'

function normalizedTitle(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase()
}

function readerTitle(context: DesktopBookTopicReadingContext): string {
  const noteTitle = context.note.title.trim()
  const topicTitle = context.topicTitle.trim()
  return normalizedTitle(noteTitle) === normalizedTitle(topicTitle)
    ? noteTitle
    : `${noteTitle} · ${topicTitle}`
}

export function BoundShelfReader({
  context,
  initialPosition,
  source,
}: {
  context: DesktopBookTopicReadingContext
  initialPosition: ReaderPosition | null
  source: ReaderSource
}) {
  const configuration = useDesktopConfiguration()
  const { enqueue, getPendingChanges } = useNotePersistence(context.note.id)
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
  const initialReadingState = useRef(bookTopic.getReadingState()).current
  const initialReaderPosition = useRef(initialReadingState.position ?? initialPosition).current
  const [annotations, setAnnotations] = useState(initialReadingState.annotations)
  const positionRef = useRef(initialReadingState.position)
  const annotationsRef = useRef(initialReadingState.annotations)

  const syncReadingState = useCallback(() => {
    const next = bookTopic.getReadingState()
    positionRef.current = next.position
    annotationsRef.current = next.annotations
    setAnnotations(next.annotations)
  }, [bookTopic])
  const handleNoteChange = useCallback((change: { noteId: string, update: Uint8Array }) => {
    enqueue(change)
    syncReadingState()
  }, [enqueue, syncReadingState])

  useEffect(() => {
    const unsubscribeLocal = note.subscribe(handleNoteChange)
    const unsubscribeExternal = window.desktop.subscribeNoteUpdates((update) => {
      if (update.noteId !== note.id)
        return
      note.importUpdates(update.update)
      syncReadingState()
    })
    if (initialReadingState.position === null && initialReaderPosition !== null)
      bookTopic.setPosition(initialReaderPosition)
    return () => {
      unsubscribeLocal()
      unsubscribeExternal()
    }
  }, [bookTopic, handleNoteChange, initialReaderPosition, initialReadingState.position, note, syncReadingState])

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

  return (
    <WindowReader
      annotationEditingEnabled
      annotations={annotations}
      arrowKeyPageTurning={configuration.readerArrowKeyPageTurning}
      initialPosition={initialReaderPosition}
      initialPresentationMode={configuration.readerEpubPresentationMode}
      source={source}
      title={readerTitle(context)}
      onAnnotationsChange={onAnnotationsChange}
      onPositionChange={onPositionChange}
    />
  )
}
