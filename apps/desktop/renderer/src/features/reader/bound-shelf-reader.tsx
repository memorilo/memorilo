import type { DesktopBookTopicReadingContext } from '@memorilo/desktop-preload'
import type { ReaderAnnotation, ReaderPosition, ReaderSource } from '@memorilo/editor/reader'
import { createEditorNote } from '@memorilo/editor'
import { WindowReader } from '@memorilo/editor/reader'
import { PanelRight } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useDesktopConfiguration } from '../../shared/configuration'
import { useNoteFavorite } from '../notes/note-favorite'
import { NoteInspectorContent } from '../notes/note-inspector'
import { NoteInspectorActions } from '../notes/note-inspector-actions'
import { useNoteInspectorEntries } from '../notes/note-inspector-state'
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
  const initialReadingState = useRef(bookTopic.getReadingState()).current
  const initialReaderPosition = useRef(initialReadingState.position ?? initialPosition).current
  const [annotations, setAnnotations] = useState(initialReadingState.annotations)
  const [entries, setEntries] = useState(() => note.getEntries())
  const positionRef = useRef(initialReadingState.position)
  const annotationsRef = useRef(initialReadingState.annotations)

  const syncNoteProjection = useCallback(() => {
    const next = bookTopic.getReadingState()
    positionRef.current = next.position
    annotationsRef.current = next.annotations
    setAnnotations(next.annotations)
    setEntries(note.getEntries())
  }, [bookTopic, note])
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
    if (initialReadingState.position === null && initialReaderPosition !== null)
      bookTopic.setPosition(initialReaderPosition)
    return () => {
      unsubscribeLocal()
      unsubscribeExternal()
    }
  }, [bookTopic, handleNoteChange, initialReaderPosition, initialReadingState.position, note, syncNoteProjection])

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
      title={readerTitle(context)}
      onAnnotationsChange={onAnnotationsChange}
      onPositionChange={onPositionChange}
    />
  )
}
