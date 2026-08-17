'use dom'

import type { EditorNote } from '@memorilo/editor/note'
import type { ReaderAnnotation, ReaderPosition, ReaderSource } from '@memorilo/editor/reader'
import type { DOMProps } from 'expo/dom'
import type {
  BoundReaderSurfaceDocument,
  LegacyReaderSurfaceDocument,
  ReaderSurfaceDocument,
  ReaderSurfaceFunctions,
  UnboundReaderSurfaceDocument,
} from './reader-surface-contract'
import { createBookEditorNote } from '@memorilo/application'
import { projectEditorNoteStorage } from '@memorilo/application/note-storage'
import { createEditorNote } from '@memorilo/editor'
import { Reader, reconciledReaderAnnotations } from '@memorilo/editor/reader'
import * as stylex from '@stylexjs/stylex'
import i18next from 'i18next'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { I18nextProvider } from 'react-i18next'
import { decodeBinary, encodeBinary } from './editor-surface-contract'
import { initEditorSurfaceI18n } from './editor-surface-i18n'
import { readerDomSurfaceStyles as styles } from './reader-dom-surface.stylex'

export interface ReaderDomSurfaceProps extends ReaderSurfaceFunctions {
  document: ReaderSurfaceDocument
  dom?: DOMProps
}

const saveDelayMilliseconds = 350

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

function openEditorNote(document: BoundReaderSurfaceDocument): EditorNote {
  return createEditorNote({
    id: document.note.id,
    snapshot: document.note.snapshot === null ? null : decodeBinary(document.note.snapshot),
    title: document.note.title,
    updates: document.note.updates.map(decodeBinary),
  })
}

function resolveBookTopicId(note: EditorNote, document: ReaderSurfaceDocument): string {
  if (document.kind === 'bound')
    return document.topicId
  const entry = note.getEntries().find(candidate => (
    candidate.kind === 'topic' && candidate.topicType === 'book'
  ))
  if (!entry)
    throw new Error(`Book Note ${note.id} does not contain a BookTopic`)
  return entry.id
}

function useReaderSource(
  document: ReaderSurfaceDocument,
  readRange: ReaderSurfaceFunctions['readRange'],
): ReaderSource {
  const callback = useRef(readRange)
  callback.current = readRange
  return useMemo<ReaderSource>(() => ({
    byteLength: document.byteLength,
    format: document.format,
    name: document.name,
    read: async (offset, length) => decodeBinary(await callback.current({
      length,
      offset,
      readingId: document.readingId,
    })),
  }), [document.byteLength, document.format, document.name, document.readingId])
}

function LegacyReader({
  document,
  readRange,
  saveState,
}: {
  document: LegacyReaderSurfaceDocument
  readRange: ReaderSurfaceFunctions['readRange']
  saveState: ReaderSurfaceFunctions['saveState']
}) {
  const source = useReaderSource(document, readRange)
  const annotationsRef = useRef(document.annotations)
  const positionRef = useRef<ReaderPosition | null>(document.position)
  const persist = useCallback(() => saveState({
    annotations: annotationsRef.current,
    position: positionRef.current,
    readingId: document.readingId,
  }), [document.readingId, saveState])
  return (
    <Reader
      annotationEditingEnabled
      defaultAnnotations={document.annotations}
      initialPosition={document.position}
      source={source}
      title={document.name}
      onAnnotationsChange={(annotations) => {
        annotationsRef.current = annotations
        void persist()
      }}
      onPositionChange={(position) => {
        positionRef.current = position
        void persist()
      }}
    />
  )
}

function BoundReader({
  document,
  note,
  readRange,
  saveNote,
}: {
  document: ReaderSurfaceDocument
  note: EditorNote
  readRange: ReaderSurfaceFunctions['readRange']
  saveNote: ReaderSurfaceFunctions['saveNote']
}) {
  const source = useReaderSource(document, readRange)
  const topicId = resolveBookTopicId(note, document)
  const bookTopic = useMemo(() => note.getBookTopic(topicId), [note, topicId])
  const initialState = useRef(bookTopic.getReadingState()).current
  const initialAnnotations = useRef(reconciledReaderAnnotations(
    note,
    topicId,
    initialState.annotations,
  )).current
  const [annotations, setAnnotations] = useState(initialAnnotations)
  const [persistenceError, setPersistenceError] = useState<Error | null>(null)
  const annotationsRef = useRef(initialAnnotations)
  const positionRef = useRef(initialState.position)
  const saveNoteRef = useRef(saveNote)
  saveNoteRef.current = saveNote

  useEffect(() => {
    let active = true
    let timer: number | null = null
    let pending: string[] = []
    let drain: Promise<void> | null = null

    const flush = (): Promise<void> => {
      if (drain)
        return drain
      if (timer !== null) {
        window.clearTimeout(timer)
        timer = null
      }
      drain = (async () => {
        while (pending.length > 0) {
          const updates = pending
          pending = []
          try {
            await saveNoteRef.current({
              ...projectEditorNoteStorage(note),
              noteId: note.id,
              title: note.getTitle(),
              updates,
            })
            if (active)
              setPersistenceError(null)
          }
          catch (error) {
            pending = [...updates, ...pending]
            const failure = toError(error)
            if (active)
              setPersistenceError(failure)
            throw failure
          }
        }
      })().finally(() => {
        drain = null
      })
      return drain
    }

    const schedule = (): void => {
      if (timer !== null)
        window.clearTimeout(timer)
      timer = window.setTimeout(() => void flush().catch(() => undefined), saveDelayMilliseconds)
    }

    const syncProjection = (): void => {
      const next = bookTopic.getReadingState()
      const nextAnnotations = reconciledReaderAnnotations(note, topicId, next.annotations)
      positionRef.current = next.position
      annotationsRef.current = nextAnnotations
      setAnnotations(nextAnnotations)
      if (nextAnnotations !== next.annotations)
        bookTopic.setAnnotations(nextAnnotations)
    }

    const unsubscribe = note.subscribe((change) => {
      pending.push(encodeBinary(change.update))
      syncProjection()
      schedule()
    })
    if (initialAnnotations !== initialState.annotations)
      bookTopic.setAnnotations(initialAnnotations)

    return () => {
      active = false
      unsubscribe()
      if (timer !== null)
        window.clearTimeout(timer)
      void flush().catch(() => undefined)
    }
  }, [bookTopic, initialAnnotations, initialState.annotations, note, topicId])

  const onPositionChange = useCallback((position: ReaderPosition) => {
    if (JSON.stringify(position) !== JSON.stringify(positionRef.current))
      bookTopic.setPosition(position)
  }, [bookTopic])
  const onAnnotationsChange = useCallback((next: readonly ReaderAnnotation[]) => {
    if (JSON.stringify(next) !== JSON.stringify(annotationsRef.current))
      bookTopic.setAnnotations(next)
  }, [bookTopic])

  return (
    <>
      {persistenceError
        ? <div {...stylex.props(styles.alert)} role="alert">{persistenceError.message}</div>
        : null}
      <Reader
        annotationEditingEnabled
        annotations={annotations}
        initialPosition={initialState.position}
        source={source}
        title={document.name}
        onAnnotationsChange={onAnnotationsChange}
        onPositionChange={onPositionChange}
      />
    </>
  )
}

function RestoredBookReader({
  document,
  readRange,
  saveNote,
}: {
  document: BoundReaderSurfaceDocument
  readRange: ReaderSurfaceFunctions['readRange']
  saveNote: ReaderSurfaceFunctions['saveNote']
}) {
  const note = useMemo(() => openEditorNote(document), [document])
  return <BoundReader document={document} note={note} readRange={readRange} saveNote={saveNote} />
}

function InitializedBookReader({
  document,
  initializeBookNote,
  readRange,
  saveNote,
}: {
  document: UnboundReaderSurfaceDocument
  initializeBookNote: ReaderSurfaceFunctions['initializeBookNote']
  readRange: ReaderSurfaceFunctions['readRange']
  saveNote: ReaderSurfaceFunctions['saveNote']
}) {
  const created = useMemo(() => createBookEditorNote({
    book: {
      book: { authors: [], title: document.name },
      file: {
        byteLength: document.byteLength,
        format: document.format,
        originalName: document.originalName,
        sha256: document.sha256,
      },
      retrievalHints: [{ kind: 'local', readingId: document.readingId }],
    },
    id: crypto.randomUUID(),
    learningEnabled: true,
    noteTitle: document.noteTitle,
    topicTitle: document.name,
  }), [document])
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let active = true
    void initializeBookNote({
      ...projectEditorNoteStorage(created.note),
      noteId: created.note.id,
      readingId: document.readingId,
      snapshot: encodeBinary(created.note.exportSnapshot()),
      title: created.note.getTitle(),
      topicId: created.topicId,
    }).then(
      () => {
        if (active)
          setReady(true)
      },
      (failure: unknown) => {
        if (active)
          setError(toError(failure))
      },
    )
    return () => {
      active = false
    }
  }, [created, document.readingId, initializeBookNote])

  if (error)
    return <div {...stylex.props(styles.alert)} role="alert">{error.message}</div>
  if (!ready)
    return <div aria-busy="true" />
  return <BoundReader document={document} note={created.note} readRange={readRange} saveNote={saveNote} />
}

export default function ReaderDomSurface(props: ReaderDomSurfaceProps) {
  const [i18nReady, setI18nReady] = useState(false)

  useEffect(() => {
    let active = true
    void initEditorSurfaceI18n(i18next).then(() => {
      if (active)
        setI18nReady(true)
    })
    return () => {
      active = false
    }
  }, [])

  if (!i18nReady)
    return null
  return (
    <I18nextProvider i18n={i18next}>
      <main {...stylex.props(styles.root)}>
        {props.document.kind === 'legacy'
          ? (
              <LegacyReader
                document={props.document}
                readRange={props.readRange}
                saveState={props.saveState}
              />
            )
          : props.document.kind === 'bound'
            ? (
                <RestoredBookReader
                  document={props.document}
                  readRange={props.readRange}
                  saveNote={props.saveNote}
                />
              )
            : (
                <InitializedBookReader
                  document={props.document}
                  initializeBookNote={props.initializeBookNote}
                  readRange={props.readRange}
                  saveNote={props.saveNote}
                />
              )}
      </main>
    </I18nextProvider>
  )
}
